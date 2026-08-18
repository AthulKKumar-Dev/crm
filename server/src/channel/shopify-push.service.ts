import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChannelPlatform, ChannelStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mergeJsonMetadata } from '../common/utils/jsonb-merge.util';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyGraphqlClient, ShopifyGraphqlError, ShopifyAuthContext } from './shopify-graphql.client';
import { OrganizationSettingsService } from '../organization-settings/organization-settings.service';
import {
  LOCATIONS_QUERY,
  LocationsResponse,
  ORDER_CREATE_MUTATION,
  OrderCreatePushResponse,
  PRODUCT_SET_MUTATION,
  ProductSetResponse,
  PRODUCT_UPDATE_MUTATION,
  ProductUpdatePushResponse,
  PRODUCT_VARIANTS_BULK_UPDATE_MUTATION,
  ProductVariantsBulkUpdateResponse,
  PRODUCT_VARIANTS_BULK_CREATE_MUTATION,
  ProductVariantsBulkCreateResponse,
  INVENTORY_SET_QUANTITIES_MUTATION,
  InventorySetQuantitiesResponse,
  VARIANT_INVENTORY_ITEM_QUERY,
  VariantInventoryItemResponse,
  ORDER_FULFILLMENT_ORDERS_QUERY,
  OrderFulfillmentOrdersResponse,
  FULFILLMENT_CREATE_MUTATION,
  FulfillmentCreateResponse,
} from './shopify-graphql.types';

// CRM weight_unit strings (REST heritage: kg/g/lb/oz) → GraphQL WeightUnit enum.
const WEIGHT_UNIT_TO_GRAPHQL: Record<string, string> = {
  kg: 'KILOGRAMS',
  g: 'GRAMS',
  lb: 'POUNDS',
  oz: 'OUNCES',
};

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
        orgId,
        'No connected Shopify channel.',
        /* incrementAttempt */ false,
      );
      return;
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, organizationId: orgId },
      include: {
        customer: true,
        channel: { select: { platform: true } },
        lineItems: { include: { variant: true } },
      },
    });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    // Re-entry guard. If the order already sits on the SHOPIFY channel, the
    // `orders/create` webhook has already rebadged it — pushing again would
    // create a SECOND Shopify order. Same if metadata already records a
    // successful push. This closes the window where `orderCreate` succeeded
    // but `recordSuccess` failed and BullMQ retried the job.
    if (order.channel.platform === ChannelPlatform.SHOPIFY) {
      this.logger.log(
        `Order ${orderId} is already on the Shopify channel (rebadged) — skipping push.`,
      );
      await this.recordSuccess(orderId, orgId, order.externalId, order.name);
      return;
    }
    const priorSync = this.readSyncMeta(order.metadata);
    if (priorSync?.status === 'SYNCED' && priorSync.shopifyOrderId) {
      this.logger.log(
        `Order ${orderId} already synced to Shopify order ${priorSync.shopifyOrderId} — skipping push.`,
      );
      return;
    }

    const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(
      channel.id,
    );

    // Resolve (or cache) the primary location id. Shopify decrements inventory
    // against the location set on the order's fulfillment.
    const locationId = await this.resolveLocationId(channel.id, shopDomain, token);

    // Build the orderCreate input. Variants with a real Shopify variant_id
    // (externalId on the local ProductVariant) reference that variant by GID.
    // CRM-only items (no Shopify mapping; externalId starts with `manual_`)
    // fall back to a custom line item — `{title, priceSet, quantity}` without
    // a variantId records the item as a one-off on the order.
    const auth: ShopifyAuthContext = { shopDomain, accessToken: token };
    const currency = order.currency;
    const money = (amount: string) => ({ shopMoney: { amount, currencyCode: currency } });

    const lineItems = order.lineItems.map((li) => {
      const externalId = li.variant?.externalId;
      const hasShopifyVariant = !!externalId && !externalId.startsWith('manual_');
      return hasShopifyVariant
        ? {
            variantId: ShopifyGraphqlClient.toGid('ProductVariant', externalId!),
            quantity: li.quantity,
            priceSet: money(li.price.toString()),
          }
        : {
            title: li.variantTitle ? `${li.title} — ${li.variantTitle}` : li.title,
            quantity: li.quantity,
            priceSet: money(li.price.toString()),
          };
    });

    // Customers originally synced from Shopify are associated by GID so no
    // duplicate is created; manual customers ride as email/phone on the order.
    const customerExternalId = order.customer?.externalId;
    const customerBlock =
      customerExternalId && !customerExternalId.startsWith('manual_') && /^\d+$/.test(customerExternalId)
        ? { toAssociate: { id: ShopifyGraphqlClient.toGid('Customer', customerExternalId) } }
        : undefined;

    const grandTotal = order.totalPrice.toString();

    const orderInput: Record<string, unknown> = {
      currency,
      email: order.customer?.email ?? undefined,
      phone: order.customer?.phone ?? undefined,
      note: order.note ?? undefined,
      tags: ['offline', 'collabo-crm', 'pos'],
      sourceName: 'collabo-crm',
      sourceIdentifier: String(order.id || ''),
      lineItems,
      ...(customerBlock ? { customer: customerBlock } : {}),
      // A successful SALE transaction covering the total marks the order paid.
      transactions: [
        {
          kind: 'SALE',
          status: 'SUCCESS',
          amountSet: money(grandTotal),
          gateway: this.resolveGateway(order.metadata),
        },
      ],
    };

    const result = await this.graphql.request<OrderCreatePushResponse>(auth, ORDER_CREATE_MUTATION, {
      order: orderInput,
      options: {
        sendReceipt: false,
        sendFulfillmentReceipt: false,
        inventoryBehaviour: 'DECREMENT_OBEYING_POLICY',
      },
    });
    ShopifyGraphqlClient.throwIfUserErrors(
      result.orderCreate?.userErrors,
      `orderCreate for CRM order ${order.name}`,
    );
    const remoteOrder = result.orderCreate?.order;
    if (!remoteOrder?.id) {
      throw new Error('Shopify order create returned no id');
    }

    await this.adoptShopifyLineItemIds(order.lineItems, remoteOrder);

    // Mirror the local PAID + FULFILLED state by fulfilling the new order's
    // fulfillment orders at the resolved location. Best-effort — if locations
    // couldn't be read (missing read_locations) or fulfillment fails, the
    // order still lands paid but unfulfilled.
    if (locationId) {
      try {
        await this.fulfillEntireOrder(auth, remoteOrder.id);
      } catch (err) {
        this.logger.warn(
          `Could not auto-fulfill pushed order ${remoteOrder.name}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    await this.recordSuccess(
      orderId,
      orgId,
      ShopifyGraphqlClient.extractId(remoteOrder.id),
      remoteOrder.name,
    );

    this.logger.log(
      `Pushed CRM order ${order.name} → Shopify order ${remoteOrder.name} (${ShopifyGraphqlClient.extractId(remoteOrder.id)})`,
    );
  }

  /**
   * Stamp Shopify's line-item ids onto the local rows we just pushed.
   *
   * Offline line items are created with `manual_<uuid>` external ids. Shopify's
   * copy of the same order uses Shopify's ids, so when the `orders/create`
   * webhook comes back and rebadges the order (C4), the line-item upsert keyed
   * on (orderId, externalId) matches nothing and inserts a SECOND set of rows —
   * the order then holds every item twice, and everything counted from line
   * items double-counts it. Adopting the ids here means the webhook updates our
   * rows in place instead, which also preserves each row's link to the local
   * product variant (Shopify returns CRM-only items as custom lines with no
   * variant, so a delete-and-recreate would lose that link).
   *
   * Best-effort by design: the Shopify order already exists by this point, so
   * throwing would send the job back to BullMQ and push a SECOND order. On any
   * doubt we log and leave the ids alone — the H2 reconcile in the sync path
   * then cleans up the duplicates instead.
   */
  private async adoptShopifyLineItemIds(
    localLines: Array<{ id: string; externalId: string; variant: { externalId: string | null } | null }>,
    remoteOrder: { name: string; lineItems?: { nodes: Array<{ id: string; variant: { id: string } | null }> } },
  ): Promise<void> {
    try {
      const remoteNodes = remoteOrder.lineItems?.nodes ?? [];
      if (remoteNodes.length === 0) return;

      // We submitted the lines in `order.lineItems` order, so index ↔ index
      // holds — but only trust it when the counts agree. A mismatch means
      // Shopify merged, split or dropped something, and mislabelling a row is
      // worse than leaving it alone.
      if (remoteNodes.length !== localLines.length) {
        this.logger.warn(
          `Shopify returned ${remoteNodes.length} line item(s) for ${remoteOrder.name} but ${localLines.length} were pushed — ` +
          `leaving local line ids untouched.`,
        );
        return;
      }

      const remoteByVariantGid = new Map<string, { id: string }>();
      for (const node of remoteNodes) {
        if (node.variant?.id) remoteByVariantGid.set(node.variant.id, node);
      }

      const claimed = new Set<string>();
      const updates: Array<{ id: string; externalId: string }> = [];

      localLines.forEach((local, index) => {
        // Only rows still carrying a local id are candidates; a re-run must not
        // rewrite an id we already adopted.
        if (!local.externalId?.startsWith('manual_')) return;

        const variantExternalId = local.variant?.externalId;
        const hasShopifyVariant = !!variantExternalId && !variantExternalId.startsWith('manual_');
        const byVariant = hasShopifyVariant
          ? remoteByVariantGid.get(
            ShopifyGraphqlClient.toGid('ProductVariant', variantExternalId!),
          )
          : undefined;

        const match = byVariant ?? remoteNodes[index];
        if (!match || claimed.has(match.id)) return;
        claimed.add(match.id);
        updates.push({ id: local.id, externalId: ShopifyGraphqlClient.extractId(match.id) });
      });

      if (updates.length === 0) return;

      await this.prisma.$transaction(
        updates.map((u) =>
          this.prisma.orderLineItem.update({
            where: { id: u.id },
            data: { externalId: u.externalId },
          }),
        ),
      );
      this.logger.log(
        `Adopted ${updates.length} Shopify line-item id(s) for ${remoteOrder.name} — the order webhook will now update these rows instead of duplicating them.`,
      );
    } catch (err) {
      this.logger.warn(
        `Could not adopt Shopify line-item ids for ${remoteOrder.name}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Fulfill every open fulfillment order on a just-created Shopify order. */
  private async fulfillEntireOrder(auth: ShopifyAuthContext, orderGid: string): Promise<void> {
    const res = await this.graphql.request<OrderFulfillmentOrdersResponse>(
      auth,
      ORDER_FULFILLMENT_ORDERS_QUERY,
      { id: orderGid },
    );
    for (const fo of res.order?.fulfillmentOrders?.nodes ?? []) {
      const createRes = await this.graphql.request<FulfillmentCreateResponse>(
        auth,
        FULFILLMENT_CREATE_MUTATION,
        {
          fulfillment: {
            lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: fo.id }],
            notifyCustomer: false,
          },
        },
      );
      const errors = createRes.fulfillmentCreate?.userErrors ?? [];
      if (errors.length > 0) {
        this.logger.warn(
          `fulfillmentCreate for ${fo.id}: ${errors.map((e) => e.message).join('; ')}`,
        );
      }
    }
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

    let nodes: LocationsResponse['locations']['nodes'];
    try {
      // Only the primary is wanted here, so a single page is enough — the
      // sort puts no guarantee on position, but `isPrimary` is unique and a
      // shop with >50 locations having its primary beyond the first page is
      // not a case worth a second round trip on the fulfillment hot path.
      // ShopifyLocationSyncService pages properly because it needs them all.
      const res = await this.graphql.request<LocationsResponse>(
        { shopDomain, accessToken: token },
        LOCATIONS_QUERY,
        { first: 50 },
      );
      nodes = res.locations?.nodes ?? [];
    } catch (err) {
      // Missing read_locations scope (or similar access errors) degrade
      // gracefully — order push without fulfillments, product push without
      // an inventory seed. Same behavior as the old REST 403 path.
      if (err instanceof ShopifyGraphqlError) {
        this.logger.warn(
          `Cannot read Shopify locations for channel ${channelId} (${err.code}). ` +
          `Ensure the app has the 'read_locations' scope to enable fulfillment at the primary location. ` +
          `Order/product push will continue without an explicit location.`,
        );
        return null;
      }
      throw err;
    }

    const primary =
      nodes.find((l) => l.isPrimary && l.isActive) ??
      nodes.find((l) => l.isActive) ??
      nodes[0];
    if (!primary) {
      this.logger.warn(`Shop ${shopDomain} has no active locations`);
      return null;
    }

    const numericId = Number(ShopifyGraphqlClient.extractId(primary.id));

    // Cache for next time
    const meta = (channel?.metadata as Prisma.JsonObject) ?? {};
    await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        metadata: { ...meta, shopifyLocationId: numericId } as Prisma.InputJsonObject,
      },
    });

    return numericId;
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
  // Atomic JSONB merges (H7). Reads are only used to compute the next
  // shopifySync.attempts value; the write never replaces the whole blob.

  private async recordSuccess(
    orderId: string,
    organizationId: string,
    shopifyOrderId: string,
    shopifyOrderName: string,
  ): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, organizationId },
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
    await this.writeSyncMeta(orderId, organizationId, next);
  }

  /**
   * Record a failure on the order's metadata. `incrementAttempt=false` is for
   * pre-flight skips (no channel connected) where retrying won't help.
   */
  async recordFailure(
    orderId: string,
    organizationId: string,
    error: string,
    incrementAttempt = true,
  ): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, organizationId },
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
    await this.writeSyncMeta(orderId, organizationId, next);
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
    organizationId: string,
    next: ShopifySyncMetadata,
  ): Promise<void> {
    await mergeJsonMetadata(this.prisma, 'orders', orderId, organizationId, {
      shopifySync: next,
    });
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
   * Supports:
   *   - Multiple variants (each with its own option1/2/3, sku, price, stock).
   *   - Product-level option types (Size, Color, …).
   *   - Multiple images (uploaded to /uploads/, sent to Shopify by `src` URL
   *     as productSet `files`).
   * Not carried over from the REST era: per-variant image linkage — merchants
   * can set variant images in Shopify Admin if needed.
   */
  async pushProduct(productId: string, orgId: string): Promise<void> {
    const shopify = await this.findShopifyChannel(orgId);
    if (!shopify || shopify.status !== ChannelStatus.CONNECTED) {
      this.logger.warn(
        `Skipping product push for ${productId}: no connected SHOPIFY channel for org ${orgId}`,
      );
      await this.recordProductFailure(
        productId,
        orgId,
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
        orgId,
        shopify.id,
        shopDomain,
        token,
        oversellGlobally,
        trackGlobally,
      );
      await this.recordProductSuccess(productId, orgId, product.externalId);
      this.logger.log(
        `Pushed update for Shopify product "${product.title}" (${product.externalId}).`,
      );
      return;
    }

    // One-shot create via productSet — options, variants, images, per-variant
    // inventory quantities AND inventory-item fields (cost / HS code / country
    // of origin / weight / tracked) all ride in a single synchronous mutation.
    const auth: ShopifyAuthContext = { shopDomain, accessToken: token };
    const locationId = await this.resolveLocationId(shopify.id, shopDomain, token);
    const input = this.buildProductSetInput(product, oversellGlobally, trackGlobally, locationId);

    const result = await this.graphql.request<ProductSetResponse>(auth, PRODUCT_SET_MUTATION, {
      input,
      synchronous: true,
    });
    ShopifyGraphqlClient.throwIfUserErrors(
      result.productSet?.userErrors,
      `productSet for "${product.title}"`,
    );
    const remote = result.productSet?.product;
    if (!remote?.id) {
      throw new Error('Shopify product create returned no id');
    }

    // Rebadge transaction: switch product + variants + images to SHOPIFY
    // channel/IDs. Variants are zip-aligned by index, which is safe because
    // Shopify preserves the order we sent. Media likewise zips by order.
    const remoteProductId = ShopifyGraphqlClient.extractId(remote.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: product.id },
        data: {
          channelId: shopify.id,
          externalId: remoteProductId,
          externalCreatedAt: new Date(),
        },
      });

      const remoteVariants = remote.variants.nodes;
      for (let i = 0; i < product.variants.length && i < remoteVariants.length; i++) {
        const localVariant = product.variants[i];
        const remoteVariant = remoteVariants[i];
        await tx.productVariant.update({
          where: { id: localVariant.id },
          data: {
            externalId: ShopifyGraphqlClient.extractId(remoteVariant.id),
            inventoryItemId: remoteVariant.inventoryItem
              ? ShopifyGraphqlClient.extractId(remoteVariant.inventoryItem.id)
              : null,
          },
        });
      }

      const remoteMedia = remote.media.nodes;
      for (let i = 0; i < product.images.length && i < remoteMedia.length; i++) {
        await tx.productImage.update({
          where: { id: product.images[i].id },
          data: { externalId: ShopifyGraphqlClient.extractId(remoteMedia[i].id) },
        });
      }
    });

    await this.recordProductSuccess(productId, orgId, remoteProductId);

    // productSet seeded the whole quantity at the primary location, because
    // that is the only location its per-variant input can name. For an org
    // running multi-location warehouses that is the wrong distribution — the
    // stock may live in a different warehouse entirely — so redistribute now
    // that the rebadge transaction above has persisted each inventoryItemId.
    // Skipped for single-location orgs, where the seed is already correct and
    // this would be a redundant mutation.
    if (await this.hasMappedWarehouses(orgId)) {
      await this.pushAvailability(orgId, product.variants.map((v) => v.id));
    }

    this.logger.log(
      `Pushed CRM product "${product.title}" → Shopify product ${remoteProductId} (${product.variants.length} variants, ${product.images.length} images)`,
    );
  }

  /** True once the locations sync has mirrored at least one Shopify location. */
  private async hasMappedWarehouses(orgId: string): Promise<boolean> {
    const count = await this.prisma.warehouse.count({
      where: {
        organizationId: orgId,
        shopifyLocationId: { not: null },
        isActive: true,
      },
    });
    return count > 0;
  }

  /**
   * Build the ProductSetInput for a one-shot GraphQL product create. Handles
   * both single-variant (placeholder Title/Default Title option) and
   * multi-variant products.
   */
  private buildProductSetInput(
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
        cost: any;
        hsCode: string | null;
        countryOfOrigin: string | null;
        inventoryQuantity: number;
        trackQuantity: boolean;
        continueSellingWhenOutOfStock: boolean;
      }>;
      images: Array<{ src: string; alt: string | null; position: number }>;
    },
    oversellGlobally: boolean,
    trackGlobally: boolean,
    locationId: number | null,
  ): Record<string, unknown> {
    const optionNames = this.deriveOptionTypes(product);
    const hasRealOptions = optionNames.length > 0;
    // Shopify's placeholder for "no options" — mirrors what REST did
    // implicitly with option1: 'Default Title'.
    const effectiveOptions = hasRealOptions ? optionNames : ['Title'];
    const optionKeys = ['option1', 'option2', 'option3'] as const;

    const valuesForOption = (idx: number): string[] => {
      if (!hasRealOptions) return ['Default Title'];
      const distinct = new Set<string>();
      for (const v of product.variants) {
        const value = v[optionKeys[idx]];
        if (value) distinct.add(value);
      }
      return distinct.size > 0 ? [...distinct] : ['Default'];
    };

    const productOptions = effectiveOptions.map((name, i) => ({
      name,
      position: i + 1,
      values: valuesForOption(i).map((v) => ({ name: v })),
    }));

    const variants = product.variants.map((v) => ({
      optionValues: hasRealOptions
        ? effectiveOptions.map((name, i) => ({
            optionName: name,
            name: v[optionKeys[i]] ?? 'Default',
          }))
        : [{ optionName: 'Title', name: 'Default Title' }],
      price: v.price.toString(),
      ...(v.compareAtPrice != null ? { compareAtPrice: v.compareAtPrice.toString() } : {}),
      ...(v.sku ? { sku: v.sku } : {}),
      ...(v.barcode ? { barcode: v.barcode } : {}),
      taxable: v.taxable,
      inventoryPolicy:
        oversellGlobally || v.continueSellingWhenOutOfStock ? 'CONTINUE' : 'DENY',
      inventoryItem: {
        tracked: trackGlobally || v.trackQuantity,
        requiresShipping: v.requiresShipping,
        ...(v.cost != null ? { cost: Number(v.cost).toFixed(2) } : {}),
        ...(v.hsCode ? { harmonizedSystemCode: v.hsCode } : {}),
        ...(v.countryOfOrigin ? { countryCodeOfOrigin: v.countryOfOrigin } : {}),
        ...(v.weight
          ? {
              measurement: {
                weight: {
                  value: Number(v.weight),
                  unit: WEIGHT_UNIT_TO_GRAPHQL[v.weightUnit ?? ''] ?? 'KILOGRAMS',
                },
              },
            }
          : {}),
      },
      ...(locationId && v.inventoryQuantity > 0
        ? {
            inventoryQuantities: [
              {
                locationId: ShopifyGraphqlClient.toGid('Location', locationId),
                name: 'available',
                quantity: v.inventoryQuantity,
              },
            ],
          }
        : {}),
    }));

    return {
      title: product.title,
      ...(product.bodyHtml ? { descriptionHtml: product.bodyHtml } : {}),
      ...(product.vendor ? { vendor: product.vendor } : {}),
      ...(product.productType ? { productType: product.productType } : {}),
      status: product.status,
      tags: product.tags ?? [],
      productOptions,
      variants,
      ...(product.images.length > 0
        ? {
            files: product.images.map((img) => ({
              originalSource: img.src,
              ...(img.alt ? { alt: img.alt } : {}),
              contentType: 'IMAGE',
            })),
          }
        : {}),
    };
  }

  /**
   * Push CRM-side edits of an already-synced product back to Shopify (GraphQL):
   *   - productUpdate              — title / body / vendor / type / tags / status
   *   - productVariantsBulkCreate  — variants added locally (admin only)
   *   - productVariantsBulkUpdate  — pricing / sku / barcode / weight / policy /
   *                                  tracked / cost / HS code / country-of-origin
   *                                  (sku, cost, weight etc. live on inventoryItem)
   *   - inventorySetQuantities     — stock (available) per variant at the location
   *
   * Option-structure changes (adding options / converting single→multi) are NOT
   * synced here — that path was intentionally removed. Vendors cannot add or
   * restructure variants (enforced in the UI); they only edit existing fields.
   * Image changes on synced products are also out of scope.
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
      options: Prisma.JsonValue;
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
    orgId: string,
    channelId: string,
    shopDomain: string,
    token: string,
    oversellGlobally: boolean,
    trackGlobally: boolean,
  ): Promise<void> {
    const auth: ShopifyAuthContext = { shopDomain, accessToken: token };
    // The stock push below resolves its own target location(s) — per mapped
    // warehouse when the org runs multi-location, primary otherwise.
    const productGid = ShopifyGraphqlClient.toGid('Product', product.externalId);

    // Top-level product fields.
    const updateRes = await this.graphql.request<ProductUpdatePushResponse>(
      auth,
      PRODUCT_UPDATE_MUTATION,
      {
        input: {
          id: productGid,
          title: product.title,
          descriptionHtml: product.bodyHtml ?? null,
          vendor: product.vendor ?? null,
          productType: product.productType ?? null,
          status: product.status,
          tags: product.tags ?? [],
        },
      },
    );
    ShopifyGraphqlClient.throwIfUserErrors(
      updateRes.productUpdate?.userErrors,
      `productUpdate ${product.externalId}`,
    );

    type PushVariant = (typeof product.variants)[number];

    // Shared per-variant input — sku / cost / weight / HS code / country /
    // tracked all live on inventoryItem in the GraphQL bulk inputs.
    const sharedVariantInput = (v: PushVariant): Record<string, unknown> => ({
      price: v.price.toString(),
      compareAtPrice: v.compareAtPrice != null ? v.compareAtPrice.toString() : null,
      ...(v.barcode ? { barcode: v.barcode } : {}),
      taxable: v.taxable,
      inventoryPolicy:
        oversellGlobally || v.continueSellingWhenOutOfStock ? 'CONTINUE' : 'DENY',
      inventoryItem: {
        tracked: trackGlobally || v.trackQuantity,
        requiresShipping: v.requiresShipping,
        ...(v.sku ? { sku: v.sku } : {}),
        ...(v.cost != null ? { cost: Number(v.cost).toFixed(2) } : {}),
        ...(v.hsCode ? { harmonizedSystemCode: v.hsCode } : {}),
        ...(v.countryOfOrigin ? { countryCodeOfOrigin: v.countryOfOrigin } : {}),
        ...(v.weight
          ? {
              measurement: {
                weight: {
                  value: Number(v.weight),
                  unit: WEIGHT_UNIT_TO_GRAPHQL[v.weightUnit ?? ''] ?? 'KILOGRAMS',
                },
              },
            }
          : {}),
      },
    });

    const newLocal = product.variants.filter(
      (v) => !v.externalId || v.externalId.startsWith('manual_'),
    );
    const existing = product.variants.filter(
      (v) => v.externalId && !v.externalId.startsWith('manual_'),
    );

    // inventoryItemId per local variant id — sourced from the DB and topped up
    // from mutation responses; drives the stock push at the end.
    const inventoryItemIds = new Map<string, string>();
    for (const v of existing) {
      if (v.inventoryItemId) inventoryItemIds.set(v.id, v.inventoryItemId);
    }

    // Brand-new variants added locally (admin only — vendors can't add).
    if (newLocal.length > 0) {
      const optionNames = this.deriveOptionTypes(product);
      try {
        const res = await this.graphql.request<ProductVariantsBulkCreateResponse>(
          auth,
          PRODUCT_VARIANTS_BULK_CREATE_MUTATION,
          {
            productId: productGid,
            variants: newLocal.map((v) => ({
              optionValues:
                optionNames.length > 0
                  ? optionNames.map((name, i) => ({
                      optionName: name,
                      name: [v.option1, v.option2, v.option3][i] ?? 'Default',
                    }))
                  : [{ optionName: 'Title', name: v.option1 ?? v.title ?? 'Default Title' }],
              ...sharedVariantInput(v),
            })),
          },
        );
        const errors = res.productVariantsBulkCreate?.userErrors ?? [];
        if (errors.length > 0) {
          this.logger.warn(
            `Failed to create new variant(s) for synced product ${product.externalId}: ${errors.map((e) => e.message).join('; ')}`,
          );
        }
        const created = res.productVariantsBulkCreate?.productVariants ?? [];
        for (let i = 0; i < newLocal.length && i < created.length; i++) {
          const rv = created[i];
          const invId = rv.inventoryItem
            ? ShopifyGraphqlClient.extractId(rv.inventoryItem.id)
            : null;
          await this.prisma.productVariant.update({
            where: { id: newLocal[i].id },
            data: {
              externalId: ShopifyGraphqlClient.extractId(rv.id),
              inventoryItemId: invId,
            },
          });
          if (invId) inventoryItemIds.set(newLocal[i].id, invId);
        }
      } catch (err) {
        this.logger.warn(
          `Failed to create new variant(s) for synced product ${product.externalId}: ${err}`,
        );
      }
    }

    // Existing variants — one bulk field-update call (no option/structure changes).
    if (existing.length > 0) {
      try {
        const res = await this.graphql.request<ProductVariantsBulkUpdateResponse>(
          auth,
          PRODUCT_VARIANTS_BULK_UPDATE_MUTATION,
          {
            productId: productGid,
            variants: existing.map((v) => ({
              id: ShopifyGraphqlClient.toGid('ProductVariant', v.externalId),
              ...sharedVariantInput(v),
            })),
          },
        );
        const errors = res.productVariantsBulkUpdate?.userErrors ?? [];
        if (errors.length > 0) {
          this.logger.warn(
            `Variant update failed for product ${product.externalId}: ${errors.map((e) => e.message).join('; ')}`,
          );
        }
        // Backfill inventoryItemIds from the response for variants where older
        // pulls didn't persist them.
        const returned = res.productVariantsBulkUpdate?.productVariants ?? [];
        const byExternalId = new Map(
          returned.map((rv) => [ShopifyGraphqlClient.extractId(rv.id), rv]),
        );
        for (const v of existing) {
          if (inventoryItemIds.has(v.id)) continue;
          const rv = byExternalId.get(v.externalId);
          const invId = rv?.inventoryItem
            ? ShopifyGraphqlClient.extractId(rv.inventoryItem.id)
            : null;
          if (invId) {
            inventoryItemIds.set(v.id, invId);
            await this.prisma.productVariant.update({
              where: { id: v.id },
              data: { inventoryItemId: invId },
            });
          }
        }
      } catch (err) {
        this.logger.warn(`Variant bulk update failed for ${product.externalId}: ${err}`);
      }
    }

    // Push current stock (available) — one mutation for every tracked variant,
    // at every mapped location when the org runs multi-location warehouses,
    // otherwise at the primary location as before.
    const tracked = product.variants.filter((v) => trackGlobally || v.trackQuantity);
    if (tracked.length > 0) {
      const invIdByVariant = await this.resolveInventoryItemIds(
        auth,
        tracked.map((v) => ({
          id: v.id,
          externalId: v.externalId,
          inventoryItemId: inventoryItemIds.get(v.id) ?? null,
        })),
      );
      const quantities = await this.buildAvailabilityQuantities(
        orgId,
        channelId,
        shopDomain,
        token,
        tracked,
        invIdByVariant,
      );
      if (quantities.length > 0) {
        await this.setInventoryQuantities(auth, quantities);
      }
    }
  }

  /**
   * Push the current sellable quantity (variant.inventoryQuantity — for
   * warehousing orgs the SUM of StockLevel.available) for specific variants to
   * the primary Shopify location. Runs as a `push-availability` queue job
   * after CRM-origin stock operations (adjustment, enable-seed, receipt,
   * return restock). Variants that never existed on Shopify (manual_ external
   * ids without an inventory item) are skipped — nothing to sync.
   */
  async pushAvailability(orgId: string, variantIds: string[]): Promise<void> {
    if (variantIds.length === 0) return;
    const shopify = await this.findShopifyChannel(orgId);
    if (!shopify || shopify.status !== ChannelStatus.CONNECTED) {
      this.logger.log(
        `Skipping availability push for org ${orgId}: no connected Shopify channel`,
      );
      return;
    }
    const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(shopify.id);
    const auth: ShopifyAuthContext = { shopDomain, accessToken: token };

    const variants = await this.prisma.productVariant.findMany({
      where: {
        id: { in: variantIds },
        organizationId: orgId,
        product: { deletedAt: null },
      },
      select: {
        id: true,
        externalId: true,
        inventoryItemId: true,
        inventoryQuantity: true,
      },
    });
    if (variants.length === 0) return;

    const invIdByVariant = await this.resolveInventoryItemIds(auth, variants);
    const quantities = await this.buildAvailabilityQuantities(
      orgId,
      shopify.id,
      shopDomain,
      token,
      variants,
      invIdByVariant,
    );

    if (quantities.length > 0) {
      await this.setInventoryQuantities(auth, quantities);
    }
  }

  /**
   * Inventory item ids for a set of variants, backfilling from Shopify for the
   * ones older pulls never persisted. Variants with no id (never pushed, or
   * `manual_` locals) are simply absent from the map.
   */
  private async resolveInventoryItemIds(
    auth: ShopifyAuthContext,
    variants: Array<{ id: string; externalId: string | null; inventoryItemId: string | null }>,
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const v of variants) {
      let invId = v.inventoryItemId;
      if (!invId && v.externalId && !v.externalId.startsWith('manual_')) {
        invId = await this.backfillInventoryItemId(auth, v.id, v.externalId);
      }
      if (invId) out.set(v.id, invId);
    }
    return out;
  }

  /**
   * One `{ inventoryItem, location, quantity }` triple per mapped warehouse.
   *
   * The presence of Shopify-mapped warehouses is the switch, not the
   * warehousing flag: it is the operative condition either way, and reading it
   * from the warehouse table avoids a second dependency on the ledger here.
   *
   *  - **Mapped warehouses exist** → push each warehouse's own `available` to
   *    the location it mirrors. Pushing the org-wide total to the primary (as
   *    this did before) left the other locations untouched, so Shopify's
   *    displayed total became our number PLUS whatever they held.
   *  - **None** → legacy orgs, and warehousing orgs whose locations sync has
   *    not run yet. Falls back to the previous behaviour exactly.
   *
   * A variant with no stock row at a mapped warehouse emits nothing for that
   * location — deliberately symmetric with the pull, which treats an absent
   * inventory level as "not stocked here" rather than as zero.
   */
  private async buildAvailabilityQuantities(
    orgId: string,
    channelId: string,
    shopDomain: string,
    token: string,
    variants: Array<{ id: string; inventoryQuantity: number }>,
    invIdByVariant: Map<string, string>,
  ): Promise<Array<{ inventoryItemId: string; locationId: string; quantity: number }>> {
    const mapped = await this.prisma.warehouse.findMany({
      where: {
        organizationId: orgId,
        shopifyLocationId: { not: null },
        isActive: true,
      },
      select: { id: true, shopifyLocationId: true },
    });

    if (mapped.length === 0) {
      const locationId = await this.resolveLocationId(channelId, shopDomain, token);
      if (!locationId) {
        this.logger.warn(
          `Skipping availability push for org ${orgId}: no resolvable Shopify location`,
        );
        return [];
      }
      return variants.flatMap((v) => {
        const invId = invIdByVariant.get(v.id);
        if (!invId) return [];
        return [
          {
            inventoryItemId: ShopifyGraphqlClient.toGid('InventoryItem', invId),
            locationId: ShopifyGraphqlClient.toGid('Location', locationId),
            quantity: v.inventoryQuantity,
          },
        ];
      });
    }

    const locationByWarehouse = new Map(
      mapped.map((w) => [w.id, w.shopifyLocationId as string]),
    );
    const levels = await this.prisma.stockLevel.findMany({
      where: {
        variantId: { in: variants.map((v) => v.id) },
        warehouseId: { in: mapped.map((w) => w.id) },
        locationId: null,
      },
      select: { variantId: true, warehouseId: true, available: true },
    });

    return levels.flatMap((level) => {
      const invId = invIdByVariant.get(level.variantId);
      const shopifyLocationId = locationByWarehouse.get(level.warehouseId);
      if (!invId || !shopifyLocationId) return [];
      return [
        {
          inventoryItemId: ShopifyGraphqlClient.toGid('InventoryItem', invId),
          locationId: ShopifyGraphqlClient.toGid('Location', shopifyLocationId),
          quantity: level.available,
        },
      ];
    });
  }

  /** Set absolute available quantities in one mutation. Best-effort — a
   *  failure is logged and never aborts the push. */
  private async setInventoryQuantities(
    auth: ShopifyAuthContext,
    quantities: Array<{ inventoryItemId: string; locationId: string; quantity: number }>,
  ): Promise<void> {
    try {
      const res = await this.graphql.request<InventorySetQuantitiesResponse>(
        auth,
        INVENTORY_SET_QUANTITIES_MUTATION,
        {
          input: {
            name: 'available',
            reason: 'correction',
            ignoreCompareQuantity: true,
            quantities,
          },
        },
      );
      const errors = res.inventorySetQuantities?.userErrors ?? [];
      if (errors.length > 0) {
        // Logged at ERROR, not WARN: a rejected push leaves Shopify holding a
        // number the CRM believes it changed, and the two only reconverge on
        // the next pull. The most common cause is an inventory item that is
        // not stocked at the target location, so the location list is named
        // here — that is the detail that makes it diagnosable, and it used to
        // be absent entirely.
        const locations = [...new Set(quantities.map((q) => q.locationId))].join(', ');
        this.logger.error(
          `inventorySetQuantities rejected ${errors.length} of ${quantities.length} quantity write(s) ` +
          `across location(s) ${locations}: ${errors.map((e) => e.message).join('; ')}`,
        );
      } else {
        this.logger.log(`Inventory set for ${quantities.length} variant/location pair(s)`);
      }
    } catch (err) {
      this.logger.error(
        `Inventory update failed for ${quantities.length} quantity write(s): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Older product pulls didn't persist inventory_item_id. Fetch it from
   *  Shopify for an existing variant and cache it locally so inventory can be
   *  pushed. Best-effort → null on failure. */
  private async backfillInventoryItemId(
    auth: ShopifyAuthContext,
    variantId: string,
    variantExternalId: string,
  ): Promise<string | null> {
    try {
      const res = await this.graphql.request<VariantInventoryItemResponse>(
        auth,
        VARIANT_INVENTORY_ITEM_QUERY,
        { id: ShopifyGraphqlClient.toGid('ProductVariant', variantExternalId) },
      );
      const invGid = res.productVariant?.inventoryItem?.id;
      if (!invGid) return null;
      const invId = ShopifyGraphqlClient.extractId(invGid);
      await this.prisma.productVariant.update({
        where: { id: variantId },
        data: { inventoryItemId: invId },
      });
      return invId;
    } catch (err) {
      this.logger.warn(
        `Failed to resolve inventory_item_id for variant ${variantExternalId}: ${err}`,
      );
      return null;
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
   * Push every CRM-only (MANUAL channel) product for the org. Called when a
   * Shopify store is freshly connected. Sequential to respect Shopify's
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
        await this.recordProductFailure(p.id, orgId, msg).catch(() => undefined);
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
        await this.recordFailure(o.id, orgId, msg, /* incrementAttempt */ true).catch(
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

  // ─── PRODUCT METADATA WRITERS ───

  private async recordProductSuccess(
    productId: string,
    organizationId: string,
    shopifyProductId: string,
  ): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      select: { metadata: true },
    });
    const prev = this.readProductSyncMeta(product?.metadata);
    const next = {
      status: 'SYNCED' as const,
      shopifyProductId,
      syncedAt: new Date().toISOString(),
      attempts: (prev?.attempts ?? 0) + 1,
    };
    await this.writeProductSyncMeta(productId, organizationId, next);
  }

  async recordProductFailure(
    productId: string,
    organizationId: string,
    error: string,
    incrementAttempt = true,
  ): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      select: { metadata: true },
    });
    const prev = this.readProductSyncMeta(product?.metadata);
    const next = {
      status: 'FAILED' as const,
      error,
      attempts: (prev?.attempts ?? 0) + (incrementAttempt ? 1 : 0),
      ...(prev?.shopifyProductId ? { shopifyProductId: prev.shopifyProductId } : {}),
    };
    await this.writeProductSyncMeta(productId, organizationId, next);
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
    organizationId: string,
    next: object,
  ): Promise<void> {
    await mergeJsonMetadata(this.prisma, 'products', productId, organizationId, {
      shopifySync: next,
    });
  }
}
