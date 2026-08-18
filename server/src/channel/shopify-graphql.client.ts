import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

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
      | 'MAX_COST_EXCEEDED'
      | 'RETRY_EXHAUSTED'
      | 'TIMEOUT'
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

/// Per-failure-class retry budgets.
///
/// These used to be a single shared counter of 5. Because 429s, 5xx responses
/// and body-level THROTTLEDs all decremented it, a run that hit one of each
/// twice exhausted the budget having genuinely retried nothing — and reported
/// failure for three separately-recoverable conditions. Each class now gets its
/// own allowance, with TOTAL_ATTEMPT_CEILING as the backstop so a pathological
/// mixture still terminates.
const THROTTLE_RETRIES = 5; // 429 + body-level THROTTLED — Shopify telling us to slow down
const SERVER_RETRIES = 4; // 5xx — Shopify having a bad moment
const TRANSPORT_RETRIES = 2; // timeouts — the connection went quiet
const TOTAL_ATTEMPT_CEILING = 9;

const BASE_BACKOFF_MS = 1000;
/// Ceiling on the exponential 5xx backoff. Without one it doubles unbounded.
const MAX_BACKOFF_MS = 16_000;
/// `Retry-After` is a value Shopify chooses and we obeyed verbatim, so an
/// unexpected number could park a worker for as long as it liked. Combined
/// with the absence of a fetch timeout, nothing could interrupt it.
const MAX_RETRY_AFTER_MS = 60_000;
/// Hard time limit on a single Shopify request. Without a signal the only
/// bound was undici's ~300s default — long enough for a silent socket to wedge
/// the worker. Every other outbound integration in this codebase already sets
/// one (Razorpay 5s, order service 15s, email service).
const SHOPIFY_FETCH_TIMEOUT_MS = 30_000;

/// Shopify's leaky bucket is per SHOP, but nothing here was: the sync worker
/// runs three jobs at once and the push and draft-mirror workers run alongside
/// it, each seeing only its own responses. Every one of them could believe the
/// bucket was healthy while collectively draining it. The last observed
/// throttle status is therefore shared through Redis.
///
/// Short TTL: a stale reading is worse than none, because the bucket refills
/// continuously and an old low reading would throttle us for no reason.
const BUCKET_STATE_TTL_S = 60;
/// Below this fraction of the bucket we wait for it to refill rather than
/// spend the remainder and take a THROTTLED round-trip.
const BUCKET_LOW_WATERMARK = 0.2;
/// Never park a worker longer than this on the shared reading alone. The
/// per-request 429 / THROTTLED handling below remains the real backstop.
const MAX_BUCKET_WAIT_MS = 5_000;

interface ShopBucketState {
  currentlyAvailable: number;
  maximumAvailable: number;
  restoreRate: number;
  /// epoch ms of the observation, so readers can project it forward
  at: number;
}

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

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private bucketKey(shopDomain: string): string {
    return `shopify:bucket:${shopDomain}`;
  }

  /**
   * Wait if another worker recently found this shop's bucket nearly empty.
   *
   * Projects the last reading forward at the shop's restore rate, so a reading
   * taken while we were waiting on our own response is still useful. Entirely
   * best-effort: any Redis problem just means we proceed and fall back to the
   * per-request retry budgets.
   */
  private async awaitBucketHeadroom(shopDomain: string): Promise<void> {
    let state: ShopBucketState | null;
    try {
      state = await this.redis.get<ShopBucketState>(this.bucketKey(shopDomain));
    } catch {
      return;
    }
    if (!state || !state.maximumAvailable || !state.restoreRate) return;

    const elapsedS = Math.max(0, (Date.now() - state.at) / 1000);
    const projected = Math.min(
      state.maximumAvailable,
      state.currentlyAvailable + elapsedS * state.restoreRate,
    );
    const floor = state.maximumAvailable * BUCKET_LOW_WATERMARK;
    if (projected >= floor) return;

    const waitMs = Math.min(
      MAX_BUCKET_WAIT_MS,
      Math.ceil(((floor - projected) / state.restoreRate) * 1000),
    );
    if (waitMs <= 0) return;
    this.logger.debug(
      `Shopify bucket for ${shopDomain} projected at ${Math.round(projected)}/${state.maximumAvailable} - waiting ${waitMs}ms for headroom.`,
    );
    await this.sleep(waitMs);
  }

  private async recordBucket(
    shopDomain: string,
    throttleStatus: {
      maximumAvailable: number;
      currentlyAvailable: number;
      restoreRate: number;
    },
  ): Promise<void> {
    try {
      await this.redis.set(
        this.bucketKey(shopDomain),
        { ...throttleStatus, at: Date.now() } satisfies ShopBucketState,
        BUCKET_STATE_TTL_S,
      );
    } catch {
      // Best-effort telemetry; never fail a request over it.
    }
  }

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

    const budget = {
      throttle: THROTTLE_RETRIES,
      server: SERVER_RETRIES,
      transport: TRANSPORT_RETRIES,
    };
    let attempt = 0;
    let lastError: string = 'unknown';

    while (attempt < TOTAL_ATTEMPT_CEILING) {
      // What every OTHER worker on this shop has seen, not just us.
      await this.awaitBucketHeadroom(auth.shopDomain);

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': auth.accessToken,
          },
          body,
          // Without this the request is bounded only by undici's ~300s
          // default. A socket that connects and then goes silent would hold
          // the worker for minutes with no way to interrupt it.
          signal: AbortSignal.timeout(SHOPIFY_FETCH_TIMEOUT_MS),
        });
      } catch (err) {
        const aborted =
          err instanceof Error &&
          (err.name === 'TimeoutError' || err.name === 'AbortError');
        if (!aborted) throw err;
        if (budget.transport-- <= 0) {
          throw new ShopifyGraphqlError(
            `Shopify GraphQL request to ${auth.shopDomain} timed out after ${SHOPIFY_FETCH_TIMEOUT_MS}ms (transport retries exhausted)`,
            'TIMEOUT',
            err,
          );
        }
        this.logger.warn(
          `GraphQL request to ${auth.shopDomain} timed out after ${SHOPIFY_FETCH_TIMEOUT_MS}ms — retrying (${budget.transport} transport retries left)`,
        );
        attempt++;
        lastError = 'TIMEOUT';
        continue;
      }

      if (res.status === 429) {
        const header = parseInt(res.headers.get('Retry-After') || '2', 10);
        // Clamp: this value is chosen by the remote end, and we used to obey
        // it verbatim.
        const waitMs = Math.min(
          MAX_RETRY_AFTER_MS,
          Math.max(0, Number.isFinite(header) ? header * 1000 : 2000),
        );
        if (budget.throttle-- <= 0) {
          lastError = 'HTTP 429';
          break;
        }
        this.logger.warn(
          `GraphQL 429 from ${auth.shopDomain}: waiting ${waitMs}ms (${budget.throttle} throttle retries left)`,
        );
        await this.sleep(waitMs);
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
        if (budget.server-- <= 0) {
          lastError = `HTTP ${res.status}`;
          break;
        }
        const backoff = this.backoffWithJitter(SERVER_RETRIES - budget.server - 1);
        this.logger.warn(
          `GraphQL ${res.status} from ${auth.shopDomain}: backing off ${backoff}ms (${budget.server} server retries left)`,
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
          MAX_BACKOFF_MS,
          Math.max(500, (requested / restoreRate) * 1000),
        );
        if (budget.throttle-- <= 0) {
          lastError = 'THROTTLED';
          break;
        }
        this.logger.warn(
          `GraphQL THROTTLED for ${auth.shopDomain}: waiting ${waitMs}ms (${budget.throttle} throttle retries left)`,
        );
        await this.sleep(waitMs);
        attempt++;
        lastError = 'THROTTLED';
        continue;
      }

      if (envelope.errors && envelope.errors.length > 0) {
        // A cost rejection is deterministic — retrying the identical query can
        // never succeed — but it IS recoverable by asking for less. Give it its
        // own code so callers can shrink their page size instead of failing the
        // whole sync on a generic error.
        const costRejected = envelope.errors.some(
          (e) =>
            (e as { extensions?: { code?: string } }).extensions?.code ===
            'MAX_COST_EXCEEDED',
        );
        throw new ShopifyGraphqlError(
          `GraphQL errors: ${envelope.errors.map((e) => e.message).join('; ')}`,
          costRejected ? 'MAX_COST_EXCEEDED' : 'GRAPHQL_ERROR',
          envelope.errors,
        );
      }

      // Pre-emptive slow-down: avoid the next call getting THROTTLED.
      const throttleStatus = envelope.extensions?.cost?.throttleStatus;
      if (throttleStatus) {
        // Cost is parsed for the sleep decisions above and was then thrown
        // away, so there was no way to answer "which query is burning the
        // rate limit". Debug level: one line per request is too noisy for
        // info, but invaluable when a tenant starts getting throttled.
        this.logger.debug(
          `Shopify cost ${auth.shopDomain}: actual=${envelope.extensions?.cost?.actualQueryCost ?? '?'} ` +
          `requested=${envelope.extensions?.cost?.requestedQueryCost ?? '?'} ` +
          `bucket=${throttleStatus.currentlyAvailable}/${throttleStatus.maximumAvailable} ` +
          `restore=${throttleStatus.restoreRate}/s`,
        );
        // Share the reading so concurrent workers on this shop see it too --
        // see awaitBucketHeadroom.
        await this.recordBucket(auth.shopDomain, throttleStatus);

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
      `Shopify GraphQL request to ${auth.shopDomain} failed after ${attempt} retries (last: ${lastError})`,
      'RETRY_EXHAUSTED',
    );
  }

  /**
   * Exponential backoff with full jitter, capped.
   *
   * The previous `BASE * 2 ** attempt` was both unbounded and perfectly
   * deterministic, so every sync that hit the same Shopify wobble retried at
   * the identical instant — a self-inflicted stampede at the worst possible
   * moment. Full jitter spreads them across the window instead.
   */
  private backoffWithJitter(retryIndex: number): number {
    const ceiling = Math.min(
      MAX_BACKOFF_MS,
      BASE_BACKOFF_MS * Math.pow(2, Math.max(0, retryIndex)),
    );
    return Math.max(100, Math.floor(Math.random() * ceiling));
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
