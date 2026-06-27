import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ShopifyAuthContext {
  shopDomain: string;
  accessToken: string;
}

/**
 * Thrown whenever a Shopify GraphQL call fails in a way the caller might want
 * to distinguish (auth, throttling exhausted, query errors, etc.). The `code`
 * is one of: AUTH_FAILED, HTTP_ERROR, GRAPHQL_ERROR, RETRY_EXHAUSTED,
 * EMPTY_RESPONSE. `details` carries the raw payload for logging.
 */
export class ShopifyGraphqlError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'AUTH_FAILED'
      | 'HTTP_ERROR'
      | 'GRAPHQL_ERROR'
      | 'RETRY_EXHAUSTED'
      | 'EMPTY_RESPONSE',
    public readonly details?: unknown,
    /// HTTP status code when the failure came from the transport layer.
    /// Callers use this to distinguish plan-gated 406s (e.g. ShopifyQL
    /// `sessions` dataset on Basic plans) from generic 4xx errors.
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'ShopifyGraphqlError';
  }
}

interface ShopifyGraphqlEnvelope<T> {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: { code?: string };
    path?: (string | number)[];
  }>;
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;

/**
 * Thin Shopify Admin GraphQL client.
 *
 * - Versioned via SHOPIFY_API_VERSION env (default `2026-01`).
 * - Auto-retries throttled requests using Shopify's cost-extension hints.
 * - Auto-retries 5xx with exponential backoff.
 * - Slows down at >80% of the throttle bucket to avoid back-to-back THROTTLEDs.
 *
 * The caller resolves credentials (decrypted accessToken + shopDomain) before
 * invoking — this mirrors the existing `ShopifyOAuthService.getAccessToken()`
 * contract used by the REST sync paths.
 */
@Injectable()
export class ShopifyGraphqlClient {
  private readonly logger = new Logger(ShopifyGraphqlClient.name);

  constructor(private readonly config: ConfigService) {}

  getApiVersion(): string {
    return this.config.get<string>('shopify.apiVersion') ?? '2026-01';
  }

  async request<TResponse, TVars = Record<string, unknown>>(
    auth: ShopifyAuthContext,
    query: string,
    variables?: TVars,
    apiVersion?: string,
  ): Promise<TResponse> {
    // `apiVersion` overrides the configured version for a single call — needed for
    // mutations only available on a newer version (e.g. fulfillmentOrderReportProgress).
    const url = `https://${auth.shopDomain}/admin/api/${apiVersion ?? this.getApiVersion()}/graphql.json`;
    const body = JSON.stringify({ query, variables: variables ?? {} });

    let attempt = 0;
    let lastError: string = 'unknown';

    while (attempt < MAX_RETRIES) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': auth.accessToken,
        },
        body,
      });

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '2', 10);
        this.logger.warn(
          `GraphQL 429 from ${auth.shopDomain}: waiting ${retryAfter}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await this.sleep(retryAfter * 1000);
        attempt++;
        lastError = `HTTP 429`;
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new ShopifyGraphqlError(
          `Shopify auth failed (${res.status}). Verify access token and scopes for ${auth.shopDomain}.`,
          'AUTH_FAILED',
          await res.text(),
        );
      }
      if (res.status >= 500) {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
        this.logger.warn(
          `GraphQL ${res.status} from ${auth.shopDomain}: backing off ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await this.sleep(backoff);
        attempt++;
        lastError = `HTTP ${res.status}`;
        continue;
      }
      if (!res.ok) {
        throw new ShopifyGraphqlError(
          `Shopify HTTP ${res.status}`,
          'HTTP_ERROR',
          await res.text(),
          res.status,
        );
      }

      const envelope = (await res.json()) as ShopifyGraphqlEnvelope<TResponse>;

      // THROTTLED is a body-level error (HTTP 200, errors array carries the
      // signal). Back off using Shopify's restoreRate when available.
      const throttled = envelope.errors?.some(
        (e) => e.extensions?.code === 'THROTTLED',
      );
      if (throttled) {
        const restoreRate =
          envelope.extensions?.cost?.throttleStatus?.restoreRate ?? 50;
        const requested = envelope.extensions?.cost?.requestedQueryCost ?? 1000;
        const waitMs = Math.min(
          16000,
          Math.max(500, (requested / restoreRate) * 1000),
        );
        this.logger.warn(
          `GraphQL THROTTLED for ${auth.shopDomain}: waiting ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await this.sleep(waitMs);
        attempt++;
        lastError = 'THROTTLED';
        continue;
      }

      if (envelope.errors && envelope.errors.length > 0) {
        throw new ShopifyGraphqlError(
          `GraphQL errors: ${envelope.errors.map((e) => e.message).join('; ')}`,
          'GRAPHQL_ERROR',
          envelope.errors,
        );
      }

      // Pre-emptive slow-down: avoid the next call getting THROTTLED.
      const throttleStatus = envelope.extensions?.cost?.throttleStatus;
      if (throttleStatus) {
        const usage =
          1 - throttleStatus.currentlyAvailable / throttleStatus.maximumAvailable;
        if (usage > 0.8) {
          await this.sleep(500);
        }
      }

      if (!envelope.data) {
        throw new ShopifyGraphqlError(
          'Shopify returned no data and no errors',
          'EMPTY_RESPONSE',
          envelope,
        );
      }

      return envelope.data;
    }

    throw new ShopifyGraphqlError(
      `Shopify GraphQL request to ${auth.shopDomain} failed after ${MAX_RETRIES} retries (last: ${lastError})`,
      'RETRY_EXHAUSTED',
    );
  }

  /**
   * Extract the numeric suffix from a Shopify global ID.
   * Example: `gid://shopify/Order/12345` → `"12345"`.
   * Returns the input untouched if it doesn't look like a gid.
   */
  static extractId(gid: string): string {
    if (!gid.startsWith('gid://')) return gid;
    const parts = gid.split('/');
    return parts[parts.length - 1];
  }

  /**
   * Build a Shopify global ID from a resource name + numeric ID.
   * Example: `toGid('Order', 12345)` → `"gid://shopify/Order/12345"`.
   * If the input already looks like a gid, returns it unchanged.
   */
  static toGid(resource: string, id: string | number): string {
    const str = String(id);
    if (str.startsWith('gid://')) return str;
    return `gid://shopify/${resource}/${str}`;
  }

  /**
   * Many Shopify mutations return a `userErrors` array containing field-level
   * validation messages. The HTTP/GraphQL layer succeeds; the business action
   * does not. Centralised here so callers can throw a uniform error.
   */
  static throwIfUserErrors(
    errors:
      | Array<{ field?: string[] | null; message: string; code?: string | null }>
      | undefined,
    context: string,
  ): void {
    if (!errors || errors.length === 0) return;
    const summary = errors
      .map((e) => `${e.field?.join('.') ?? '?'}: ${e.message}`)
      .join('; ');
    throw new ShopifyGraphqlError(
      `${context}: ${summary}`,
      'GRAPHQL_ERROR',
      errors,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
