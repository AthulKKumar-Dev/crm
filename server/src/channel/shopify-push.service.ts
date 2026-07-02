import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChannelPlatform, ChannelStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import { OrganizationSettingsService } from '../organization-settings/organization-settings.service';

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
    private readonly orgSettings: OrganizationSettingsService,
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

  /** GET helper — mirrors `postShopify` for read operations. */
  private async getShopify<T>(
    shopDomain: string,
    token: string,
    endpoint: string,
  ): Promise<T> {
    const res = await fetch(
      `https://${shopDomain}/admin/api/${this.apiVersion}${endpoint}`,
      { headers: { 'X-Shopify-Access-Token': token } },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify ${res.status} on ${endpoint}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

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
   * Product + variants + images from the MANUAL channel to the SHOPIFY channel
   * using the new Shopify IDs. After this completes, the existing read-
   * direction sync handles future updates.
   *
   * Now supports:
   *   - Multiple variants (each with its own option1/2/3, sku, price, stock).
   *   - Product-level option types (Size, Color, …).
   *   - Multiple images (uploaded to /uploads/, sent to Shopify by `src` URL).
   *   - Variant→image linkage (a second `PUT /variants/{id}.json` per variant
   *     because Shopify REST won't accept `image_id` in the create payload).
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
        images: { orderBy: { position: 'asc' } },
        channel: true,
      },
    });
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    if (product.variants.length === 0) {
      throw new Error(`Product ${product.id} has no variants to push`);
    }

    const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(shopify.id);

    // Read the org's product settings once per push so the global
    // overrides flow through to Shopify's per-variant inventory fields.
    const productSettings = await this.orgSettings.getProductSettings(orgId);
    const oversellGlobally = productSettings.allowOversellGlobally === true;
    const trackGlobally = productSettings.trackQuantityGlobally === true;

    // SHOPIFY-channel product → push as an update (PUT). The CRM allows
    // editing synced products; this is the path that propagates those local
    // edits back to the Shopify store. New variants are also handled (POST);
    // image changes on synced products are still out of scope.
    if (product.channel.platform === ChannelPlatform.SHOPIFY) {
      await this.pushProductUpdate(
        product,
        shopify.id,
        shopDomain,
        token,
        oversellGlobally,
        trackGlobally,
      );
      await this.recordProductSuccess(productId, product.externalId);
      this.logger.log(
        `Pushed update for Shopify product "${product.title}" (${product.externalId}).`,
      );
      return;
    }

    const payload = this.buildShopifyProductPayload(
      product,
      oversellGlobally,
      trackGlobally,
    );

    const result = await this.postShopify<{
      product: {
        id: number;
        variants: Array<{ id: number; inventory_item_id: number; option1?: string; option2?: string; option3?: string }>;
        images?: Array<{ id: number; src: string; position: number }>;
      };
    }>(shopDomain, token, '/products.json', payload);

    if (!result?.product?.id) {
      throw new Error('Shopify product create returned no id');
    }

    // Rebadge transaction: switch product + variants + images to SHOPIFY
    // channel/IDs. Variants are zip-aligned by index, which is safe because
    // Shopify preserves the order we sent. Images likewise zip by position.
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

      const remoteImages = result.product.images ?? [];
      for (let i = 0; i < product.images.length && i < remoteImages.length; i++) {
        const localImage = product.images[i];
        const remoteImage = remoteImages[i];
        await tx.productImage.update({
          where: { id: localImage.id },
          data: { externalId: String(remoteImage.id) },
        });
      }
    });

    // Bind variant→image after create (Shopify REST quirk — variants.image_id
    // can't be set inline). Best-effort; failures don't undo the push.
    await this.bindVariantImages(
      shopDomain,
      token,
      product.variants,
      product.images,
      result.product.variants,
      result.product.images ?? [],
    );

    // Push per-variant inventory_item metadata (cost, hsCode, countryOfOrigin).
    await this.pushInventoryItemMetadata(
      shopDomain,
      token,
      product.variants,
      result.product.variants,
    );

    // Seed inventory per variant at the primary location.
    await this.seedInventoryPerVariant(
      shopify.id,
      shopDomain,
      token,
      product.variants,
      result.product.variants,
    );

    await this.recordProductSuccess(productId, String(result.product.id));

    this.logger.log(
      `Pushed CRM product "${product.title}" → Shopify product ${result.product.id} (${product.variants.length} variants, ${product.images.length} images)`,
    );
  }

  /**
   * Push CRM-side edits of an already-synced product back to Shopify.
   *   - PUT  /products/{id}.json            — title / body / vendor / type / tags / status
   *   - POST /products/{id}/variants.json   — for variants added locally after sync
   *   - PUT  /variants/{id}.json            — per-existing-variant pricing / sku / barcode /
   *                                            weight / inventory policy / shipping / taxable
   *   - PUT  /inventory_items/{id}.json     — cost / hsCode / countryOfOrigin (when set)
   *
   * Image changes (add/remove/reorder) on synced products are NOT pushed in
   * this iteration — local image edits stay local until the next pull-sync
   * overwrites the local snapshot. Tracked as a follow-up.
   *
   * Local externalIds for newly-created variants get rewritten to the real
   * Shopify ids returned by POST so subsequent pushes go through the PUT path.
   */
  private async pushProductUpdate(
    product: {
      id: string;
      externalId: string;
      title: string;
      bodyHtml: string | null;
      vendor: string | null;
      productType: string | null;
      status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
      tags: string[];
      variants: Array<{
        id: string;
        externalId: string;
        inventoryItemId: string | null;
        title: string;
        option1: string | null;
        option2: string | null;
        option3: string | null;
        price: any;
        sku: string | null;
        compareAtPrice: any;
        barcode: string | null;
        weight: any;
        weightUnit: string | null;
        cost: any;
        hsCode: string | null;
        countryOfOrigin: string | null;
        inventoryQuantity: number;
        trackQuantity: boolean;
        continueSellingWhenOutOfStock: boolean;
        requiresShipping: boolean;
        taxable: boolean;
      }>;
    },
    channelId: string,
    shopDomain: string,
    token: string,
    oversellGlobally: boolean,
    trackGlobally: boolean,
  ): Promise<void> {
    // Resolve the primary location once. Shopify sets stock via
    // /inventory_levels/set.json (not the variant endpoint), so we need it to
    // push per-variant inventory below. Null when read_locations scope is
    // missing — inventory is then skipped (already logged by resolveLocationId).
    const locationId = await this.resolveLocationId(channelId, shopDomain, token);

    // Top-level product fields.
    await this.putShopify(shopDomain, token, `/products/${product.externalId}.json`, {
      product: {
        id: Number(product.externalId),
        title: product.title,
        body_html: product.bodyHtml ?? undefined,
        vendor: product.vendor ?? undefined,
        product_type: product.productType ?? undefined,
        status: this.mapStatusToShopify(product.status),
        tags: (product.tags ?? []).join(', '),
      },
    });

    // Per-variant fields. Each variant is an independent call — failures on
    // one are logged but don't stop the others.
    for (const variant of product.variants) {
      const isNewLocal =
        !variant.externalId || variant.externalId.startsWith('manual_');

      if (isNewLocal) {
        // Brand-new variant added locally to a synced product. Create it on
        // Shopify (POST), then rewrite the local externalId / inventoryItemId
        // so future edits go through the PUT path.
        try {
          const result = await this.postShopify<{
            variant: { id: number; inventory_item_id: number };
          }>(shopDomain, token, `/products/${product.externalId}/variants.json`, {
            variant: {
              option1: variant.option1 ?? variant.title ?? 'Default Title',
              ...(variant.option2 ? { option2: variant.option2 } : {}),
              ...(variant.option3 ? { option3: variant.option3 } : {}),
              price: variant.price.toString(),
              sku: variant.sku ?? undefined,
              compare_at_price: variant.compareAtPrice?.toString() ?? undefined,
              barcode: variant.barcode ?? undefined,
              weight: variant.weight ? Number(variant.weight) : undefined,
              weight_unit: variant.weightUnit ?? undefined,
              inventory_management: variant.trackQuantity ? 'shopify' : null,
              inventory_policy:
              oversellGlobally || variant.continueSellingWhenOutOfStock ? 'continue' : 'deny',
              requires_shipping: variant.requiresShipping,
              taxable: variant.taxable,
            },
          });
          if (result?.variant?.id) {
            await this.prisma.productVariant.update({
              where: { id: variant.id },
              data: {
                externalId: String(result.variant.id),
                inventoryItemId: String(result.variant.inventory_item_id),
              },
            });
            // Push inventory item meta if present.
            await this.pushInventoryItemMetaForVariant(
              shopDomain,
              token,
              variant,
              String(result.variant.inventory_item_id),
            );
            // Seed stock for the newly-created variant.
            if (locationId && (trackGlobally || variant.trackQuantity)) {
              await this.setInventoryLevel(
                shopDomain,
                token,
                locationId,
                String(result.variant.inventory_item_id),
                variant.inventoryQuantity,
              );
            }
          }
        } catch (err) {
          this.logger.warn(
            `Failed to create new variant for synced product ${product.externalId}: ${err}`,
          );
        }
        continue;
      }

      // Existing variant — straight update.
      try {
        await this.putShopify(shopDomain, token, `/variants/${variant.externalId}.json`, {
          variant: {
            id: Number(variant.externalId),
            // Option values (Size / Color / …) — carry local renames to Shopify.
            option1: variant.option1 ?? undefined,
            option2: variant.option2 ?? undefined,
            option3: variant.option3 ?? undefined,
            price: variant.price.toString(),
            sku: variant.sku ?? undefined,
            compare_at_price: variant.compareAtPrice?.toString() ?? null,
            barcode: variant.barcode ?? undefined,
            weight: variant.weight ? Number(variant.weight) : undefined,
            weight_unit: variant.weightUnit ?? undefined,
            inventory_management:
              trackGlobally || variant.trackQuantity ? 'shopify' : null,
            inventory_policy:
              oversellGlobally || variant.continueSellingWhenOutOfStock ? 'continue' : 'deny',
            requires_shipping: variant.requiresShipping,
            taxable: variant.taxable,
          },
        });
      } catch (err) {
        this.logger.warn(
          `Variant update failed for ${variant.externalId}: ${err}`,
        );
      }

      // Older pulls didn't persist inventory_item_id. Without it we can push
      // neither inventory levels nor inventory-item meta — so backfill it from
      // Shopify on demand and cache it locally for next time.
      let inventoryItemId = variant.inventoryItemId;
      if (!inventoryItemId) {
        inventoryItemId = await this.backfillInventoryItemId(
          shopDomain,
          token,
          variant.id,
          variant.externalId,
        );
      }

      // Inventory-item meta (cost / hsCode / countryOfOrigin) for existing variants.
      await this.pushInventoryItemMetaForVariant(
        shopDomain,
        token,
        variant,
        inventoryItemId,
      );

      // Push current stock. The variant PUT above does not carry inventory —
      // Shopify requires the inventory_levels endpoint.
      if (
        locationId &&
        inventoryItemId &&
        (trackGlobally || variant.trackQuantity)
      ) {
        await this.setInventoryLevel(
          shopDomain,
          token,
          locationId,
          inventoryItemId,
          variant.inventoryQuantity,
        );
      } else {
        // Make the skip reason visible — otherwise a non-updating stock looks
        // like a silent no-op.
        this.logger.warn(
          `Inventory NOT pushed for variant ${variant.externalId}: ` +
            `locationId=${locationId ?? 'null'}, ` +
            `inventoryItemId=${inventoryItemId ?? 'null'}, ` +
            `trackQuantity=${variant.trackQuantity}, trackGlobally=${trackGlobally}`,
        );
      }
    }
  }

  /** Older product pulls didn't persist inventory_item_id. Fetch it from
   *  Shopify for an existing variant and cache it locally so inventory (and
   *  inventory-item meta) can be pushed. Best-effort → null on failure. */
  private async backfillInventoryItemId(
    shopDomain: string,
    token: string,
    variantId: string,
    variantExternalId: string,
  ): Promise<string | null> {
    try {
      const res = await this.getShopify<{
        variant: { inventory_item_id: number };
      }>(shopDomain, token, `/variants/${variantExternalId}.json`);
      const invId = res?.variant?.inventory_item_id;
      if (!invId) return null;
      await this.prisma.productVariant.update({
        where: { id: variantId },
        data: { inventoryItemId: String(invId) },
      });
      return String(invId);
    } catch (err) {
      this.logger.warn(
        `Failed to resolve inventory_item_id for variant ${variantExternalId}: ${err}`,
      );
      return null;
    }
  }

  /** Single-variant version of pushInventoryItemMetadata, used by both the
   *  create-then-rebadge flow's loop and the update flow above. */
  private async pushInventoryItemMetaForVariant(
    shopDomain: string,
    token: string,
    variant: { cost: any; hsCode: string | null; countryOfOrigin: string | null },
    inventoryItemId: string | null,
  ): Promise<void> {
    const hasMeta =
      variant.cost != null ||
      variant.hsCode != null ||
      variant.countryOfOrigin != null;
    if (!hasMeta || !inventoryItemId) return;
    try {
      await this.putShopify(
        shopDomain,
        token,
        `/inventory_items/${inventoryItemId}.json`,
        {
          inventory_item: {
            id: Number(inventoryItemId),
            cost: variant.cost != null ? Number(variant.cost).toFixed(2) : undefined,
            harmonized_system_code: variant.hsCode ?? undefined,
            country_code_of_origin: variant.countryOfOrigin ?? undefined,
          },
        },
      );
    } catch (err) {
      this.logger.warn(
        `Inventory item update failed for ${inventoryItemId}: ${err}`,
      );
    }
  }

  /**
   * Build the `POST /products.json` payload from a CRM product. Handles both
   * single-variant (`Default Title` / no options) and multi-variant cases.
   *
   * Note: cost / hsCode / countryOfOrigin live on the `inventory_item` resource,
   * not on the variant — those are sent via `seedInventoryItemMeta` after the
   * product create returns and we know the inventory_item_ids.
   */
  private buildShopifyProductPayload(
    product: {
      title: string;
      bodyHtml: string | null;
      vendor: string | null;
      productType: string | null;
      status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
      tags: string[];
      options: Prisma.JsonValue;
      variants: Array<{
        price: any;
        sku: string | null;
        option1: string | null;
        option2: string | null;
        option3: string | null;
        compareAtPrice: any;
        requiresShipping: boolean;
        taxable: boolean;
        barcode: string | null;
        weight: any;
        weightUnit: string | null;
        trackQuantity: boolean;
        continueSellingWhenOutOfStock: boolean;
      }>;
      images: Array<{ src: string; alt: string | null; position: number }>;
    },
    oversellGlobally: boolean,
    trackGlobally: boolean,
  ) {
    const optionsArr = this.deriveOptionTypes(product);

    return {
      product: {
        title: product.title,
        body_html: product.bodyHtml ?? undefined,
        vendor: product.vendor ?? undefined,
        product_type: product.productType ?? undefined,
        status: this.mapStatusToShopify(product.status),
        tags: (product.tags ?? []).join(', '),
        ...(optionsArr.length > 0 ? { options: optionsArr.map((name) => ({ name })) } : {}),
        variants: product.variants.map((v) => ({
          price: v.price.toString(),
          sku: v.sku ?? undefined,
          option1: v.option1 ?? 'Default Title',
          ...(v.option2 ? { option2: v.option2 } : {}),
          ...(v.option3 ? { option3: v.option3 } : {}),
          compare_at_price: v.compareAtPrice?.toString() ?? undefined,
          barcode: v.barcode ?? undefined,
          weight: v.weight ? Number(v.weight) : undefined,
          weight_unit: v.weightUnit ?? undefined,
          // null inventory_management = "Don't track quantity" in Shopify.
          // Global override forces tracking on for every variant when ON.
          inventory_management:
            trackGlobally || v.trackQuantity ? 'shopify' : null,
          // Global override forces continue-sell on for every variant when ON.
          inventory_policy:
            oversellGlobally || v.continueSellingWhenOutOfStock ? 'continue' : 'deny',
          requires_shipping: v.requiresShipping,
          taxable: v.taxable,
        })),
        ...(product.images.length > 0
          ? {
              images: product.images.map((img) => ({
                src: img.src,
                alt: img.alt ?? undefined,
                position: img.position,
              })),
            }
          : {}),
      },
    };
  }

  /**
   * Set per-variant inventory_item metadata (cost, harmonized_system_code,
   * country_code_of_origin) via Shopify's `/inventory_items/:id.json` REST
   * resource. Required because these fields don't ride on the product or
   * variant objects in the create payload — they live on inventory_item.
   *
   * Best-effort: a failure on one variant logs a warning and continues. If
   * the merchant's app lacks `write_inventory` scope, this whole step is a
   * no-op (postShopify throws an actionable 403).
   */
  private async pushInventoryItemMetadata(
    shopDomain: string,
    token: string,
    localVariants: Array<{
      cost: any;
      hsCode: string | null;
      countryOfOrigin: string | null;
    }>,
    remoteVariants: Array<{ inventory_item_id: number }>,
  ): Promise<void> {
    for (let i = 0; i < localVariants.length && i < remoteVariants.length; i++) {
      const lv = localVariants[i];
      const rv = remoteVariants[i];
      const hasMeta =
        lv.cost != null || lv.hsCode != null || lv.countryOfOrigin != null;
      if (!hasMeta || !rv?.inventory_item_id) continue;

      try {
        await this.putShopify(
          shopDomain,
          token,
          `/inventory_items/${rv.inventory_item_id}.json`,
          {
            inventory_item: {
              id: rv.inventory_item_id,
              cost: lv.cost != null ? Number(lv.cost).toFixed(2) : undefined,
              harmonized_system_code: lv.hsCode ?? undefined,
              country_code_of_origin: lv.countryOfOrigin ?? undefined,
            },
          },
        );
      } catch (err) {
        this.logger.warn(
          `Failed to set inventory_item ${rv.inventory_item_id} metadata: ${err}`,
        );
      }
    }
  }

  /**
   * Derive option type names from `Product.options` (preferred) or fall back
   * to inferring from variants when a multi-variant product was created
   * without an explicit options block.
   */
  private deriveOptionTypes(product: {
    options: Prisma.JsonValue;
    variants: Array<{ option1: string | null; option2: string | null; option3: string | null }>;
  }): string[] {
    if (Array.isArray(product.options)) {
      return product.options
        .filter((o) => o && typeof o === 'object' && !Array.isArray(o))
        .map((o) => (o as Record<string, unknown>).name as string)
        .filter(Boolean);
    }
    // Infer from variants — if any variant has option2 set, we have 2 options, etc.
    const has1 = product.variants.some((v) => v.option1 && v.option1 !== 'Default Title');
    const has2 = product.variants.some((v) => !!v.option2);
    const has3 = product.variants.some((v) => !!v.option3);
    if (!has1) return [];
    if (has3) return ['Option 1', 'Option 2', 'Option 3'];
    if (has2) return ['Option 1', 'Option 2'];
    return ['Option 1'];
  }

  /**
   * After create, walk each local variant that has a linked image and PUT
   * the matching Shopify image_id onto the corresponding remote variant.
   * Failures are logged but don't fail the push — variant images can be set
   * manually in Shopify Admin if this step fails.
   */
  private async bindVariantImages(
    shopDomain: string,
    token: string,
    localVariants: Array<{ id: string; imageId: string | null; option1: string | null; option2: string | null; option3: string | null }>,
    localImages: Array<{ id: string; position: number }>,
    remoteVariants: Array<{ id: number; option1?: string; option2?: string; option3?: string }>,
    remoteImages: Array<{ id: number; position: number }>,
  ): Promise<void> {
    const linksToCreate = localVariants
      .map((lv, idx) => {
        if (!lv.imageId) return null;
        const localImg = localImages.find((i) => i.id === lv.imageId);
        if (!localImg) return null;
        const remoteImg = remoteImages.find((ri) => ri.position === localImg.position);
        if (!remoteImg) return null;
        const remoteVariant = remoteVariants[idx];
        if (!remoteVariant) return null;
        return { variantId: remoteVariant.id, imageId: remoteImg.id };
      })
      .filter(Boolean) as Array<{ variantId: number; imageId: number }>;

    for (const link of linksToCreate) {
      try {
        await this.putShopify(shopDomain, token, `/variants/${link.variantId}.json`, {
          variant: { id: link.variantId, image_id: link.imageId },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to bind variant ${link.variantId} → image ${link.imageId}: ${err}`,
        );
      }
    }
  }

  /**
   * Set inventory levels at the primary location for each variant that has
   * stock > 0. Best-effort: a failure on one variant is logged and the rest
   * still run. Skipped entirely when `read_locations` scope is missing.
   */
  private async seedInventoryPerVariant(
    channelId: string,
    shopDomain: string,
    token: string,
    localVariants: Array<{ inventoryQuantity: number }>,
    remoteVariants: Array<{ inventory_item_id: number }>,
  ): Promise<void> {
    const haveStock = localVariants.some((v) => v.inventoryQuantity > 0);
    if (!haveStock) return;

    const locationId = await this.resolveLocationId(channelId, shopDomain, token);
    if (!locationId) return;

    for (let i = 0; i < localVariants.length && i < remoteVariants.length; i++) {
      const lv = localVariants[i];
      const rv = remoteVariants[i];
      if (lv.inventoryQuantity <= 0 || !rv?.inventory_item_id) continue;

      try {
        await this.postShopify(shopDomain, token, '/inventory_levels/set.json', {
          location_id: locationId,
          inventory_item_id: rv.inventory_item_id,
          available: lv.inventoryQuantity,
        });
      } catch (err) {
        this.logger.warn(
          `Inventory seed failed for inventory_item ${rv.inventory_item_id}: ${err}`,
        );
      }
    }
  }

  /** Set a single variant's available stock at the given location. Best-effort:
   *  a failure is logged and does not abort the rest of the sync. */
  private async setInventoryLevel(
    shopDomain: string,
    token: string,
    locationId: number,
    inventoryItemId: string,
    quantity: number,
  ): Promise<void> {
    try {
      await this.postShopify(shopDomain, token, '/inventory_levels/set.json', {
        location_id: locationId,
        inventory_item_id: Number(inventoryItemId),
        available: quantity,
      });
      this.logger.log(
        `Inventory set: inventory_item ${inventoryItemId} → available=${quantity} @ location ${locationId}`,
      );
    } catch (err) {
      this.logger.warn(
        `Inventory update failed for inventory_item ${inventoryItemId}: ${err}`,
      );
    }
  }

  /** PUT helper — mirrors `postShopify` but for update operations. */
  private async putShopify<T>(
    shopDomain: string,
    token: string,
    endpoint: string,
    body: unknown,
  ): Promise<T> {
    const res = await fetch(
      `https://${shopDomain}/admin/api/${this.apiVersion}${endpoint}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify PUT ${res.status} on ${endpoint}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  /**
   * Push every CRM-only (MANUAL channel) product for the org. Called when a
   * Shopify store is freshly connected. Sequential to respect Shopify's REST
   * rate limits.
   */
  /**
   * Triggered by the channels-page "Push to Shopify" / "Sync Now" button.
   * Picks up two kinds of pending work in a single sweep:
   *
   *   1. MANUAL-channel products that have never been pushed (no shopifySync
   *      metadata) or last attempted FAILED → create on Shopify.
   *   2. SHOPIFY-channel products with status `OUT_OF_SYNC` (the user edited
   *      them locally) or `FAILED` (the previous push update failed) → push
   *      the local edits via the update path in `pushProduct`.
   *
   * Already-SYNCED and currently-PENDING products are left alone so we don't
   * race in-flight jobs or re-push unchanged data.
   */
  async bulkPushManualProducts(orgId: string): Promise<void> {
    // Pull every product for the org with its channel platform; filter in
    // app code because Prisma JSON-path queries against optional nested
    // fields are awkward, and the row count is bounded by the catalog size.
    const products = await this.prisma.product.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: { channel: { select: { platform: true } } },
    });

    const toPush = products.filter((p) => {
      const sync = this.readProductSyncMeta(p.metadata);
      const status = sync?.status;
      // Skip in-flight + already-good states regardless of channel.
      if (status === 'PENDING' || status === 'SYNCED') return false;
      if (p.channel.platform === ChannelPlatform.MANUAL) {
        // MANUAL: push if never pushed or last attempt failed.
        return !status || status === 'FAILED';
      }
      if (p.channel.platform === ChannelPlatform.SHOPIFY) {
        // SHOPIFY-rebadged: push only when there's something to send.
        return status === 'OUT_OF_SYNC' || status === 'FAILED';
      }
      return false;
    });

    if (toPush.length === 0) {
      this.logger.log(`Org ${orgId} has no products pending Shopify push.`);
      return;
    }

    this.logger.log(
      `Bulk-pushing ${toPush.length} pending product(s) for org ${orgId}…`,
    );

    let succeeded = 0;
    let failed = 0;
    for (const p of toPush) {
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
