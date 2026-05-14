import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChannelPlatform, ChannelStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyGraphqlClient } from './shopify-graphql.client';

/** Shape persisted on Order.metadata.shopifySync to track push state. */
export interface ShopifySyncMetadata {
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  shopifyOrderId?: string;
  shopifyOrderName?: string;
  error?: string;
  syncedAt?: string;
  attempts: number;
}

/**
 * Pushes a locally-created (offline / in-store) order to the merchant's
 * connected Shopify store. Inventory is decremented automatically by Shopify
 * via `inventory_behaviour: 'decrement_obeying_policy'` — we do NOT make a
 * separate inventory adjust call.
 */
@Injectable()
export class ShopifyPushService {
  private readonly logger = new Logger(ShopifyPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly graphql: ShopifyGraphqlClient,
  ) { }

  /** Resolves the configured Shopify Admin API version (env-driven). */
  private get apiVersion(): string {
    return this.graphql.getApiVersion();
  }

  /** Resolve the org's connected SHOPIFY channel (if any). Null = nothing to push. */
  async findShopifyChannel(orgId: string) {
    return this.prisma.channel.findUnique({
      where: {
        organizationId_platform: {
          organizationId: orgId,
          platform: ChannelPlatform.SHOPIFY,
        },
      },
    });
  }

  /** Main entry point — invoked by the BullMQ processor. */
  async pushOrder(orderId: string, orgId: string): Promise<void> {
    const channel = await this.findShopifyChannel(orgId);
    if (!channel || channel.status !== ChannelStatus.CONNECTED) {
      this.logger.warn(
        `Skipping Shopify push for order ${orderId}: no connected SHOPIFY channel for org ${orgId}`,
      );
      await this.recordFailure(
        orderId,
        'No connected Shopify channel.',
        /* incrementAttempt */ false,
      );
      return;
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, organizationId: orgId },
      include: {
        customer: true,
        lineItems: { include: { variant: true } },
      },
    });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(
      channel.id,
    );

    // Resolve (or cache) the primary location id. Shopify decrements inventory
    // against the location set on the order's fulfillment.
    const locationId = await this.resolveLocationId(channel.id, shopDomain, token);

    // Build the Shopify order payload. Variants with a real Shopify variant_id
    // (externalId on the local ProductVariant) reference that variant directly.
    // CRM-only items (no Shopify mapping; externalId starts with `manual_`)
    // fall back to a custom line item — Shopify accepts `{title, price, quantity}`
    // without a variant_id and records the item as a one-off on the order.
    const lineItems: Array<
      | { variant_id: number; quantity: number; price: string }
      | { title: string; quantity: number; price: string }
    > = [];
    for (const li of order.lineItems) {
      const externalId = li.variant?.externalId;
      const hasShopifyVariant =
        !!externalId && !externalId.startsWith('manual_');

      if (hasShopifyVariant) {
        lineItems.push({
          variant_id: Number(externalId),
          quantity: li.quantity,
          price: li.price.toString(),
        });
      } else {
        lineItems.push({
          title: li.variantTitle ? `${li.title} — ${li.variantTitle}` : li.title,
          quantity: li.quantity,
          price: li.price.toString(),
        });
      }
    }

    const customerBlock = this.buildCustomerBlock(order.customer);

    const grandTotal = order.totalPrice.toString();

    const payload = {
      order: {
        email: order.customer?.email ?? undefined,
        phone: order.customer?.phone ?? undefined,
        send_receipt: false,
        send_fulfillment_receipt: false,
        inventory_behaviour: 'decrement_obeying_policy',
        financial_status: 'paid',
        currency: order.currency,
        tags: 'offline,collabo-crm,pos',
        note: order.note ?? undefined,
        line_items: lineItems,
        source_name: 'collabo-crm',
        source_identifier: String(order.id || ''),
        source_url: `${process.env.APP_URL}/orders/${order.id}`,
        ...(customerBlock ? { customer: customerBlock } : {}),
        transactions: [
          {
            kind: 'sale',
            status: 'success',
            amount: grandTotal,
            gateway: this.resolveGateway(order.metadata),
          },
        ],
        // Attach a fulfillment at the resolved location to mirror the local
        // PAID + FULFILLED state. If locations couldn't be read (403 missing
        // read_locations), we skip this block — the order still lands paid,
        // but unfulfilled. Merchant can mark fulfilled manually or add the
        // scope and retry.
        ...(locationId
          ? {
            fulfillments: [
              {
                location_id: locationId,
                tracking_info: null,
                notify_customer: false,
              },
            ],
          }
          : {}),
      },
    };

    const result = await this.postShopify<{
      order: { id: number; name: string };
    }>(shopDomain, token, '/orders.json', payload);

    if (!result?.order?.id) {
      throw new Error('Shopify order create returned no id');
    }

    await this.recordSuccess(
      orderId,
      String(result.order.id),
      result.order.name,
    );

    this.logger.log(
      `Pushed CRM order ${order.name} → Shopify order ${result.order.name} (${result.order.id})`,
    );
  }

  /**
   * Look up the shop's primary location once and cache on channel.metadata.
   * Returns null when the merchant's token lacks `read_locations` (so the
   * caller can degrade gracefully — order push without fulfillments,
   * product push without inventory seed).
   */
  private async resolveLocationId(
    channelId: string,
    shopDomain: string,
    token: string,
  ): Promise<number | null> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { metadata: true },
    });
    const cached = (channel?.metadata as any)?.shopifyLocationId;
    if (typeof cached === 'number') return cached;

    const res = await fetch(
      `https://${shopDomain}/admin/api/${this.apiVersion}/locations.json`,
      { headers: { 'X-Shopify-Access-Token': token } },
    );
    if (res.status === 403) {
      this.logger.warn(
        `Cannot read Shopify locations for channel ${channelId} (403). ` +
        `Add 'read_locations' scope to your Shopify app to enable fulfillment at the primary location. ` +
        `Order/product push will continue without an explicit location.`,
      );
      return null;
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch Shopify locations: ${res.status}`);
    }
    const data = (await res.json()) as {
      locations: Array<{ id: number; primary: boolean; active: boolean }>;
    };
    const primary =
      data.locations.find((l) => l.primary && l.active) ??
      data.locations.find((l) => l.active) ??
      data.locations[0];
    if (!primary) {
      this.logger.warn(`Shop ${shopDomain} has no active locations`);
      return null;
    }

    // Cache for next time
    const meta = (channel?.metadata as Prisma.JsonObject) ?? {};
    await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        metadata: { ...meta, shopifyLocationId: primary.id } as Prisma.InputJsonObject,
      },
    });

    return primary.id;
  }

  /**
   * Build the `customer` block for the order. If the local Customer was
   * originally synced from Shopify (its externalId is a numeric Shopify ID,
   * not a synthetic `manual_*` one), we reference by id so Shopify doesn't
   * create a duplicate. Otherwise we embed details and let Shopify dedup
   * by email.
   */
  private buildCustomerBlock(
    customer: {
      externalId: string;
      email: string | null;
      phone: string | null;
      firstName: string | null;
      lastName: string | null;
    } | null,
  ): Record<string, unknown> | null {
    if (!customer) return null;

    const isShopifyId = !customer.externalId.startsWith('manual_');
    if (isShopifyId && /^\d+$/.test(customer.externalId)) {
      return { id: Number(customer.externalId) };
    }

    return {
      email: customer.email ?? undefined,
      phone: customer.phone ?? undefined,
      first_name: customer.firstName ?? undefined,
      last_name: customer.lastName ?? undefined,
    };
  }

  /** Map our paymentMethod to a Shopify gateway label (display only). */
  private resolveGateway(metadata: Prisma.JsonValue): string {
    if (
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      'paymentMethod' in metadata
    ) {
      const pm = (metadata as Record<string, unknown>).paymentMethod;
      if (typeof pm === 'string') return `manual_${pm.toLowerCase()}`;
    }
    return 'manual';
  }

  // ─── METADATA WRITERS ───

  private async recordSuccess(
    orderId: string,
    shopifyOrderId: string,
    shopifyOrderName: string,
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { metadata: true },
    });
    const prev = this.readSyncMeta(order?.metadata);
    const next: ShopifySyncMetadata = {
      status: 'SYNCED',
      shopifyOrderId,
      shopifyOrderName,
      syncedAt: new Date().toISOString(),
      attempts: (prev?.attempts ?? 0) + 1,
    };
    await this.writeSyncMeta(orderId, order?.metadata, next);
  }

  /**
   * Record a failure on the order's metadata. `incrementAttempt=false` is for
   * pre-flight skips (no channel connected) where retrying won't help.
   */
  async recordFailure(
    orderId: string,
    error: string,
    incrementAttempt = true,
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { metadata: true },
    });
    const prev = this.readSyncMeta(order?.metadata);
    const next: ShopifySyncMetadata = {
      status: 'FAILED',
      error,
      attempts: (prev?.attempts ?? 0) + (incrementAttempt ? 1 : 0),
      ...(prev?.shopifyOrderId
        ? { shopifyOrderId: prev.shopifyOrderId }
        : {}),
      ...(prev?.shopifyOrderName
        ? { shopifyOrderName: prev.shopifyOrderName }
        : {}),
    };
    await this.writeSyncMeta(orderId, order?.metadata, next);
  }

  private readSyncMeta(metadata: Prisma.JsonValue | null | undefined):
    | ShopifySyncMetadata
    | null {
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata)
    ) {
      return null;
    }
    const m = (metadata as Record<string, unknown>).shopifySync;
    return (m as ShopifySyncMetadata) ?? null;
  }

  private async writeSyncMeta(
    orderId: string,
    current: Prisma.JsonValue | null | undefined,
    next: ShopifySyncMetadata,
  ): Promise<void> {
    const base =
      current && typeof current === 'object' && !Array.isArray(current)
        ? (current as Prisma.JsonObject)
        : {};
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        metadata: {
          ...base,
          shopifySync: next as unknown as Prisma.InputJsonValue,
        } as Prisma.InputJsonObject,
      },
    });
  }

  // ─── REST HELPER ───

  private async postShopify<T>(
    shopDomain: string,
    token: string,
    endpoint: string,
    body: unknown,
  ): Promise<T> {
    const res = await fetch(
      `https://${shopDomain}/admin/api/${this.apiVersion}${endpoint}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify(body),
      },
    );
    if (res.status === 403) {
      const text = await res.text();
      const scopeNeeded = this.scopeForEndpoint(endpoint);
      throw new Error(
        `Shopify denied this request (403)` +
        (scopeNeeded
          ? `: your Shopify app is missing the '${scopeNeeded}' scope. ` +
          `Open Shopify Admin → Apps → your custom app → API access and enable it. `
          : '. ') +
        `Details: ${text}`,
      );
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify ${res.status} on ${endpoint}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  /** Map our REST endpoints back to the Shopify OAuth scope they need.
   *  Used to turn 403s into actionable error messages stamped on
   *  `metadata.shopifySync.error`. */
  private scopeForEndpoint(endpoint: string): string | null {
    if (endpoint.startsWith('/orders')) return 'write_orders';
    if (endpoint.startsWith('/products')) return 'write_products';
    if (endpoint.startsWith('/inventory_levels')) return 'write_inventory';
    if (endpoint.startsWith('/locations')) return 'read_locations';
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PRODUCT PUSH (CRM → Shopify)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Push a single CRM-native product to Shopify, then rebadge the local
   * Product + variants from the MANUAL channel to the SHOPIFY channel using
   * the new Shopify IDs. After this completes, the existing read-direction
   * sync handles future updates.
   */
  async pushProduct(productId: string, orgId: string): Promise<void> {
    const shopify = await this.findShopifyChannel(orgId);
    if (!shopify || shopify.status !== ChannelStatus.CONNECTED) {
      this.logger.warn(
        `Skipping product push for ${productId}: no connected SHOPIFY channel for org ${orgId}`,
      );
      await this.recordProductFailure(
        productId,
        'No connected Shopify channel.',
        false,
      );
      return;
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId: orgId, deletedAt: null },
      include: {
        variants: { orderBy: { position: 'asc' } },
        channel: true,
      },
    });
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    // Already-synced products are skipped — Shopify is the source of truth
    // once a product lives on the SHOPIFY channel.
    if (product.channel.platform === ChannelPlatform.SHOPIFY) {
      this.logger.log(`Product ${product.id} already on SHOPIFY channel, skipping push.`);
      return;
    }

    const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(shopify.id);

    // Build the Shopify product payload. Single-variant only for this cut.
    const variant = product.variants[0];
    if (!variant) {
      throw new Error(`Product ${product.id} has no variant to push`);
    }

    const payload = {
      product: {
        title: product.title,
        body_html: product.bodyHtml ?? undefined,
        vendor: product.vendor ?? undefined,
        product_type: product.productType ?? undefined,
        status: this.mapStatusToShopify(product.status),
        tags: (product.tags ?? []).join(', '),
        variants: [
          {
            price: variant.price.toString(),
            sku: variant.sku ?? undefined,
            option1: variant.option1 ?? 'Default Title',
            compare_at_price: variant.compareAtPrice?.toString() ?? undefined,
            inventory_management: 'shopify',
            requires_shipping: variant.requiresShipping,
            taxable: variant.taxable,
          },
        ],
      },
    };

    const result = await this.postShopify<{
      product: {
        id: number;
        variants: Array<{ id: number; inventory_item_id: number }>;
      };
    }>(shopDomain, token, '/products.json', payload);

    if (!result?.product?.id) {
      throw new Error('Shopify product create returned no id');
    }

    // Rebadge: switch the local product (and variants) to the SHOPIFY channel
    // with their new Shopify IDs. Done in a small transaction so we don't end
    // up with mismatched product/variant externalIds on partial failure.
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: product.id },
        data: {
          channelId: shopify.id,
          externalId: String(result.product.id),
          externalCreatedAt: new Date(),
        },
      });
      for (let i = 0; i < product.variants.length && i < result.product.variants.length; i++) {
        const localVariant = product.variants[i];
        const remoteVariant = result.product.variants[i];
        await tx.productVariant.update({
          where: { id: localVariant.id },
          data: {
            externalId: String(remoteVariant.id),
            inventoryItemId: String(remoteVariant.inventory_item_id),
          },
        });
      }
    });

    // Optionally seed initial inventory at the primary location. This is a
    // best-effort step — failure is logged but not propagated, since the
    // rebadge already succeeded. Skipped when read_locations isn't granted
    // (resolveLocationId returns null) or the variant has 0 stock.
    if (variant.inventoryQuantity > 0) {
      try {
        const locationId = await this.resolveLocationId(shopify.id, shopDomain, token);
        const inventoryItemId = result.product.variants[0]?.inventory_item_id;
        if (locationId && inventoryItemId) {
          await this.postShopify(shopDomain, token, '/inventory_levels/set.json', {
            location_id: locationId,
            inventory_item_id: inventoryItemId,
            available: variant.inventoryQuantity,
          });
        }
      } catch (err) {
        this.logger.warn(
          `Inventory seed failed for product ${product.id} (push otherwise succeeded): ${err}`,
        );
      }
    }

    await this.recordProductSuccess(productId, String(result.product.id));

    this.logger.log(
      `Pushed CRM product "${product.title}" → Shopify product ${result.product.id}`,
    );
  }

  /**
   * Push every CRM-only (MANUAL channel) product for the org. Called when a
   * Shopify store is freshly connected. Sequential to respect Shopify's REST
   * rate limits.
   */
  async bulkPushManualProducts(orgId: string): Promise<void> {
    const manual = await this.prisma.channel.findUnique({
      where: {
        organizationId_platform: {
          organizationId: orgId,
          platform: ChannelPlatform.MANUAL,
        },
      },
    });
    if (!manual) {
      this.logger.log(`Org ${orgId} has no MANUAL channel — nothing to bulk-push.`);
      return;
    }

    // Pull all MANUAL products then filter to unsynced/failed in app code —
    // Prisma JSON-path queries against optional nested fields are awkward,
    // and the row count here is bounded by the org's CRM-native product list.
    const products = await this.prisma.product.findMany({
      where: {
        organizationId: orgId,
        channelId: manual.id,
        deletedAt: null,
      },
      select: { id: true, metadata: true },
    });

    const unsynced = products.filter((p) => !this.isAlreadySynced(p.metadata));
    if (unsynced.length === 0) {
      this.logger.log(`Org ${orgId} has no unsynced CRM products to push.`);
      return;
    }

    this.logger.log(
      `Bulk-pushing ${unsynced.length} unsynced CRM product(s) for org ${orgId}…`,
    );

    let succeeded = 0;
    let failed = 0;
    for (const p of unsynced) {
      try {
        await this.pushProduct(p.id, orgId);
        succeeded++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Bulk push: product ${p.id} failed: ${msg}`);
        await this.recordProductFailure(p.id, msg).catch(() => undefined);
      }
    }

    this.logger.log(
      `Bulk product push complete for org ${orgId}: ${succeeded} succeeded, ${failed} failed.`,
    );
  }

  /**
   * Push every unsynced offline (MANUAL channel) order to the connected
   * Shopify store. Mirror of `bulkPushManualProducts`. Triggered by the
   * channels-page Sync action after the pull step completes.
   */
  async bulkPushUnsyncedOrders(orgId: string): Promise<void> {
    const manual = await this.prisma.channel.findUnique({
      where: {
        organizationId_platform: {
          organizationId: orgId,
          platform: ChannelPlatform.MANUAL,
        },
      },
    });
    if (!manual) {
      this.logger.log(`Org ${orgId} has no MANUAL channel — nothing to bulk-push.`);
      return;
    }

    const orders = await this.prisma.order.findMany({
      where: {
        organizationId: orgId,
        channelId: manual.id,
        deletedAt: null,
      },
      select: { id: true, metadata: true },
    });

    const unsynced = orders.filter((o) => !this.isAlreadySynced(o.metadata));
    if (unsynced.length === 0) {
      this.logger.log(`Org ${orgId} has no unsynced offline orders to push.`);
      return;
    }

    this.logger.log(
      `Bulk-pushing ${unsynced.length} unsynced offline order(s) for org ${orgId}…`,
    );

    let succeeded = 0;
    let failed = 0;
    for (const o of unsynced) {
      try {
        await this.pushOrder(o.id, orgId);
        succeeded++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Bulk push: order ${o.id} failed: ${msg}`);
        await this.recordFailure(o.id, msg, /* incrementAttempt */ true).catch(
          () => undefined,
        );
      }
    }

    this.logger.log(
      `Bulk order push complete for org ${orgId}: ${succeeded} succeeded, ${failed} failed.`,
    );
  }

  /** Returns true when metadata.shopifySync.status is exactly 'SYNCED'. */
  private isAlreadySynced(metadata: Prisma.JsonValue | null | undefined): boolean {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return false;
    }
    const sync = (metadata as Prisma.JsonObject).shopifySync;
    if (!sync || typeof sync !== 'object' || Array.isArray(sync)) return false;
    return (sync as Prisma.JsonObject).status === 'SYNCED';
  }

  private mapStatusToShopify(status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'): string {
    return ({ ACTIVE: 'active', DRAFT: 'draft', ARCHIVED: 'archived' } as const)[status];
  }

  // ─── PRODUCT METADATA WRITERS ───

  private async recordProductSuccess(
    productId: string,
    shopifyProductId: string,
  ): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { metadata: true },
    });
    const prev = this.readProductSyncMeta(product?.metadata);
    const next = {
      status: 'SYNCED' as const,
      shopifyProductId,
      syncedAt: new Date().toISOString(),
      attempts: (prev?.attempts ?? 0) + 1,
    };
    await this.writeProductSyncMeta(productId, product?.metadata, next);
  }

  async recordProductFailure(
    productId: string,
    error: string,
    incrementAttempt = true,
  ): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { metadata: true },
    });
    const prev = this.readProductSyncMeta(product?.metadata);
    const next = {
      status: 'FAILED' as const,
      error,
      attempts: (prev?.attempts ?? 0) + (incrementAttempt ? 1 : 0),
      ...(prev?.shopifyProductId ? { shopifyProductId: prev.shopifyProductId } : {}),
    };
    await this.writeProductSyncMeta(productId, product?.metadata, next);
  }

  private readProductSyncMeta(metadata: Prisma.JsonValue | null | undefined):
    | { status: string; shopifyProductId?: string; error?: string; attempts: number }
    | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
    const m = (metadata as Record<string, unknown>).shopifySync;
    return (m as any) ?? null;
  }

  private async writeProductSyncMeta(
    productId: string,
    current: Prisma.JsonValue | null | undefined,
    next: object,
  ): Promise<void> {
    const base =
      current && typeof current === 'object' && !Array.isArray(current)
        ? (current as Prisma.JsonObject)
        : {};
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        metadata: {
          ...base,
          shopifySync: next as unknown as Prisma.InputJsonValue,
        } as Prisma.InputJsonObject,
      },
    });
  }
}
