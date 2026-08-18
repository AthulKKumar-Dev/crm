import { Injectable, Logger } from '@nestjs/common';
import {
    ChannelPlatform,
    ChannelStatus,
    SyncStatus,
    ProductStatus,
    OrderFinancialStatus,
    OrderFulfillmentStatus,
    OrderCancelReason,
    CustomerState,
    Prisma,
} from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { ShopifyGraphqlClient, ShopifyGraphqlError } from './shopify-graphql.client';
import { ShopifyPushEnqueuer } from './shopify-push.enqueuer';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { ShopifyLocationSyncService } from './shopify-location-sync.service';
import {
    DRAFT_MIRROR_QUEUE,
    DraftMirrorJobData,
} from '../draft-order/draft-mirror.queue';
import {
    MailingAddress,
    OrdersListResponse,
    OrdersListVariables,
    OrderLineItemsPageResponse,
    OrderLineItemsPageVariables,
    ORDER_LINE_ITEMS_PAGE_QUERY,
    OrderNode,
    ORDERS_LIST_QUERY,
    ORDERS_COUNT_QUERY,
    PRODUCTS_COUNT_QUERY,
    CUSTOMERS_COUNT_QUERY,
    PRODUCTS_LIST_QUERY,
    ProductsListResponse,
    ProductsListVariables,
    ProductSyncNode,
    PRODUCTS_INVENTORY_QUERY,
    ProductsInventoryResponse,
    CUSTOMERS_LIST_QUERY,
    CustomersListResponse,
    CustomersListVariables,
    CustomerSyncNode,
    COLLECTIONS_LIST_QUERY,
    CollectionsListResponse,
    CollectionsListVariables,
    CollectionSyncNode,
    COLLECTION_PRODUCTS_QUERY,
    CollectionProductsResponse,
    PageInfo,
} from './shopify-graphql.types';
import { parseProductSettings } from '../organization-settings/schemas/product-settings.schema';

const GRAPHQL_PAGE_SIZE = 50;

/// Above this many line items in a single order payload we stop trusting the
/// array to be complete and skip the H2 reconcile rather than risk deleting
/// real lines. Shopify documents no completeness guarantee for very large
/// order webhooks, and the largest order in this dataset has 8 items — so the
/// cap costs nothing in practice and only bites on wholesale-sized orders.
const LINE_ITEM_RECONCILE_CAP = 100;

/// How far back to rewind the sync watermark from the run's start time.
/// `updated_at` is stamped by SHOPIFY's clock and compared against OURS, so a
/// few seconds of drift between the two servers would reopen the very window
/// the start-time stamp exists to close. Re-reading a couple of minutes of
/// orders is free: the upserts are idempotent and `upsertOrder`'s
/// compare-and-set makes re-applying an unchanged order a no-op.
const SYNC_WATERMARK_SKEW_MS = 2 * 60 * 1000;

/// A saved pagination cursor is only worth resuming while Shopify still
/// honours it and the run it belongs to is plausibly the one being retried.
/// Past this age a log is retired rather than resurrected — the failure mode
/// it guards against is a crashed run left pinned at IN_PROGRESS whose stale
/// cursor would otherwise be picked up days later.
export const SYNC_RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000;

// GraphQL WeightUnit enum → REST weight_unit strings the DB already stores.
const WEIGHT_UNIT_MAP: Record<string, string> = {
    KILOGRAMS: 'kg',
    GRAMS: 'g',
    POUNDS: 'lb',
    OUNCES: 'oz',
};

@Injectable()
export class ShopifySyncService {
    private readonly logger = new Logger(ShopifySyncService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly shopifyOAuth: ShopifyOAuthService,
        private readonly loyalty: LoyaltyService,
        private readonly graphql: ShopifyGraphqlClient,
        private readonly pushEnqueuer: ShopifyPushEnqueuer,
        private readonly inventoryLedger: InventoryLedgerService,
        private readonly locationSync: ShopifyLocationSyncService,
        @InjectQueue(DRAFT_MIRROR_QUEUE)
        private readonly draftMirrorQueue: Queue<DraftMirrorJobData>,
    ) { }

    /**
     * Enqueue a single `bulk-mirror` trigger so the draft-order processor
     * fans out one `draft-create` job per unsynced draft. Lives here (not in
     * `ShopifyPushEnqueuer`) because drafts have their own dedicated queue
     * with separate retry/backoff config.
     */
    private async enqueueDraftBulkMirror(orgId: string): Promise<void> {
        try {
            await this.draftMirrorQueue.add(
                'mirror-bulk',
                { type: 'bulk-mirror', organizationId: orgId },
                {
                    attempts: 3,
                    backoff: { type: 'exponential' as const, delay: 5_000 },
                    removeOnComplete: { age: 60 * 60 * 24 * 7 },
                    removeOnFail: { age: 60 * 60 * 24 * 30 },
                },
            );
        } catch (err) {
            this.logger.warn(
                `Failed to enqueue draft bulk-mirror for org ${orgId}: ${err}`,
            );
        }
    }

    async runSync(channelId: string, orgId: string, entityTypes: string[]): Promise<void> {
        const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
        if (!channel) throw new Error(`Channel ${channelId} not found`);

        // Non-Shopify channels (MANUAL, INSTAGRAM, WHATSAPP) have no remote
        // source to pull from. We still want to honour the user's "Sync"
        // gesture on the MANUAL channel by running the bulk push of unsynced
        // local items to whichever Shopify channel the org has — but we must
        // never try to resolve OAuth credentials for the MANUAL channel
        // itself. Mark the sync done cleanly and fall through to the bulk
        // push at the bottom of this method.
        if (channel.platform !== ChannelPlatform.SHOPIFY) {
            this.logger.log(
                `Sync requested on non-Shopify channel ${channelId} ` +
                `(platform=${channel.platform}); skipping pull, running bulk push only.`,
            );
            await this.prisma.channel.update({
                where: { id: channelId },
                data: {
                    syncStatus: SyncStatus.COMPLETED,
                    status: ChannelStatus.CONNECTED,
                    lastSyncedAt: new Date(),
                },
            });
            try {
                await this.pushEnqueuer.enqueueBulkProductPush({
                    type: 'bulk-products',
                    organizationId: orgId,
                });
                await this.pushEnqueuer.enqueueBulkOrderPush({
                    type: 'bulk-orders',
                    organizationId: orgId,
                });
                await this.enqueueDraftBulkMirror(orgId);
            } catch (err) {
                this.logger.warn(
                    `Failed to enqueue bulk push for org ${orgId}: ${err}`,
                );
            }
            return;
        }

        // Mark as syncing
        await this.prisma.channel.update({
            where: { id: channelId },
            data: { syncStatus: SyncStatus.IN_PROGRESS, status: ChannelStatus.SYNCING },
        });

        let allSucceeded = true;
        let authFailed = false;
        let initError: Error | null = null;
        let token: string | null = null;
        let shopDomain: string | null = null;

        // The watermark this run will claim, captured BEFORE any Shopify call.
        //
        // This used to be `new Date()` evaluated in the `finally` below, i.e.
        // the moment the run FINISHED — while `syncOrders` asks Shopify for
        // `updated_at >= lastSyncedAt`. Anything edited while the run was in
        // flight was therefore already older than the new watermark and was
        // never fetched again: not delayed, lost. Stamping the start instead
        // means the next run re-covers the window this one was working in.
        const syncStartedAt = new Date(Date.now() - SYNC_WATERMARK_SKEW_MS);

        // EVERYTHING below this point is wrapped in a try/finally so the
        // channel's syncStatus *cannot* get stuck on IN_PROGRESS. Previously
        // `getAccessToken` was outside the try, so a credential / decryption
        // failure would leave the row pinned and the UI button stuck on
        // "Syncing…" forever (and BullMQ retries hit the same wall).
        try {
            try {
                const auth = await this.shopifyOAuth.getAccessToken(channelId);
                token = auth.token;
                shopDomain = auth.shopDomain;
            } catch (err) {
                allSucceeded = false;
                initError = err instanceof Error ? err : new Error(String(err));
                this.logger.error(
                    `Sync init failed for channel ${channelId}: could not resolve access token`,
                    initError,
                );
            }

            if (token && shopDomain) {
                for (const entityType of entityTypes) {
                    try {
                        switch (entityType) {
                            // Ordered first by the callers' entity lists: the
                            // per-location inventory reconcile needs the
                            // warehouse mapping to exist before it runs.
                            case 'locations':
                                await this.locationSync.syncLocations(channelId, orgId, shopDomain, token);
                                break;
                            case 'products':
                                await this.syncProducts(channelId, orgId, shopDomain, token);
                                break;
                            case 'orders':
                                await this.syncOrders(channelId, orgId, shopDomain, token);
                                break;
                            case 'customers':
                                await this.syncCustomers(channelId, orgId, shopDomain, token);
                                break;
                            case 'inventory':
                                await this.syncInventory(channelId, orgId, shopDomain, token);
                                break;
                            case 'collections':
                                await this.syncCollections(channelId, orgId, shopDomain, token);
                                break;
                        }
                    } catch (error) {
                        allSucceeded = false;
                        // Token revoked (app uninstalled / secret rotated) —
                        // mark the channel DISCONNECTED instead of ERROR so
                        // the UI surfaces "Reconnect" and retries stop.
                        if (error instanceof ShopifyGraphqlError && error.code === 'AUTH_FAILED') {
                            authFailed = true;
                        }
                        this.logger.error(`Sync failed for ${entityType} on channel ${channelId}`, error);
                    }
                }
            }
        } finally {
            // Defensive: even if the update itself throws (e.g. DB hiccup),
            // we don't want to swallow that on top of an existing error.
            await this.prisma.channel.update({
                where: { id: channelId },
                data: {
                    syncStatus: allSucceeded ? SyncStatus.COMPLETED : SyncStatus.FAILED,
                    status: allSucceeded
                        ? ChannelStatus.CONNECTED
                        : authFailed
                            ? ChannelStatus.DISCONNECTED
                            : ChannelStatus.ERROR,
                    lastSyncedAt: allSucceeded ? syncStartedAt : undefined,
                },
            }).catch((err) => {
                this.logger.error(
                    `Failed to clear syncStatus for channel ${channelId} (manual unstick may be needed)`,
                    err,
                );
            });
        }

        // After the pull completes (regardless of partial failures), kick off
        // bulk-push jobs for any locally-unsynced products and offline orders.
        // This is what makes the channels-page Sync button "sync everything in
        // both directions" with one click. Jobs are queued asynchronously —
        // failures here don't fail the user's sync request.
        try {
            await this.pushEnqueuer.enqueueBulkProductPush({
                type: 'bulk-products',
                organizationId: orgId,
            });
            await this.pushEnqueuer.enqueueBulkOrderPush({
                type: 'bulk-orders',
                organizationId: orgId,
            });
            await this.enqueueDraftBulkMirror(orgId);
        } catch (err) {
            this.logger.warn(
                `Failed to enqueue post-sync bulk push for org ${orgId}: ${err}`,
            );
        }

        // Surface the initial-credential error preferentially so the BullMQ
        // failure log shows the underlying cause, not a generic "syncs failed".
        if (initError) throw initError;
        if (!allSucceeded) throw new Error('One or more entity syncs failed');
    }

    // ─── SYNC PRODUCTS ───
    private async syncProducts(channelId: string, orgId: string, shopDomain: string, token: string) {
        const syncLog = await this.createSyncLog(channelId, orgId, 'products');
        let processed = 0;
        let failed = 0;

        try {
            const auth = { shopDomain, accessToken: token };
            await this.updateTotalEstimated(syncLog.id, auth, PRODUCTS_COUNT_QUERY, 'productsCount');

            const vendorMetafield = await this.getVendorMetafieldConfig(orgId);
            for await (const page of this.paginateProductsGraphql(auth, syncLog.cursor, vendorMetafield)) {
                for (const node of page.products) {
                    try {
                        const sp = this.transformGraphqlProduct(node);
                        // Vendor metafield is inlined in the query — no extra call.
                        // undefined = feature off (leave vendorKey untouched).
                        const vendorKey = vendorMetafield
                            ? (node.vendorMetafield?.value != null ? String(node.vendorMetafield.value) : null)
                            : undefined;
                        await this.upsertProduct(channelId, orgId, sp, vendorKey);
                        processed++;
                    } catch (error) {
                        failed++;
                        this.logger.error(`Failed product ${node.id}`, error);
                    }
                }
                await this.prisma.syncLog.update({
                    where: { id: syncLog.id },
                    data: { recordsProcessed: processed, recordsFailed: failed, cursor: page.nextCursor },
                });
            }
            await this.completeSyncLog(syncLog.id, processed, failed);
        } catch (error) {
            await this.failSyncLog(syncLog.id, processed, failed, error);
            throw error;
        }
    }

    private async *paginateProductsGraphql(
        auth: { shopDomain: string; accessToken: string },
        startCursor: string | null,
        vendorMetafield: { namespace: string; key: string } | null,
    ): AsyncGenerator<{ products: ProductSyncNode[]; nextCursor: string | null }> {
        let cursor: string | null = startCursor ?? null;
        do {
            const variables: ProductsListVariables = {
                first: GRAPHQL_PAGE_SIZE,
                after: cursor,
                withMetafield: !!vendorMetafield,
                // $mfKey is non-null in the query — pass a harmless placeholder
                // when the feature is off (the field is skipped via @include).
                mfNamespace: vendorMetafield?.namespace ?? 'custom',
                mfKey: vendorMetafield?.key ?? 'vendor',
            };
            const res = await this.graphql.request<ProductsListResponse, ProductsListVariables>(
                auth,
                PRODUCTS_LIST_QUERY,
                variables,
            );
            const nextCursor = res.products.pageInfo.hasNextPage
                ? res.products.pageInfo.endCursor
                : null;
            yield { products: res.products.nodes, nextCursor };
            cursor = nextCursor;
        } while (cursor);
    }

    // GraphQL ProductSyncNode → the REST snake_case shape `upsertProduct`
    // consumes (shared with the products/* webhooks). Same bridging strategy
    // as `transformGraphqlOrder` below.
    private transformGraphqlProduct(node: ProductSyncNode): Record<string, any> {
        const variants = node.variants.nodes.map((v) => {
            const weight = v.inventoryItem?.measurement?.weight ?? null;
            return {
                id: ShopifyGraphqlClient.extractId(v.id),
                title: v.title,
                sku: v.sku,
                barcode: v.barcode,
                price: v.price,
                compare_at_price: v.compareAtPrice,
                inventory_quantity: v.inventoryQuantity ?? 0,
                inventory_item_id: v.inventoryItem
                    ? ShopifyGraphqlClient.extractId(v.inventoryItem.id)
                    : null,
                weight: weight?.value ?? null,
                weight_unit: weight?.unit ? (WEIGHT_UNIT_MAP[weight.unit] ?? weight.unit.toLowerCase()) : null,
                // REST option1/2/3 follow the product's option order — so do
                // GraphQL selectedOptions.
                option1: v.selectedOptions?.[0]?.value ?? null,
                option2: v.selectedOptions?.[1]?.value ?? null,
                option3: v.selectedOptions?.[2]?.value ?? null,
                position: v.position,
                requires_shipping: v.inventoryItem?.requiresShipping ?? true,
                taxable: v.taxable,
            };
        });

        const images = node.media.nodes
            .filter((m) => m.image?.url)
            .map((m, i) => ({
                id: ShopifyGraphqlClient.extractId(m.id),
                src: m.image!.url,
                alt: m.image!.altText,
                position: i + 1,
            }));

        return {
            id: ShopifyGraphqlClient.extractId(node.id),
            title: node.title,
            body_html: node.descriptionHtml,
            vendor: node.vendor,
            product_type: node.productType,
            status: node.status ? node.status.toLowerCase() : 'active',
            // `upsertProduct` splits on ',' — mirror the REST string shape.
            tags: Array.isArray(node.tags) ? node.tags.join(', ') : '',
            published_at: node.publishedAt,
            created_at: node.createdAt,
            updated_at: node.updatedAt,
            options: node.options?.length
                ? node.options.map((o) => ({ name: o.name, values: o.values, position: o.position }))
                : null,
            variants,
            images,
        };
    }

    // ─── SYNC ORDERS ───
    // Reads orders via the Shopify Admin GraphQL API (Phase 0 migration).
    // The downstream `upsertOrder` still consumes the REST snake_case shape, so
    // `transformGraphqlOrder` bridges the two — one place to maintain.
    // Note: if an existing syncLog has a REST `page_info` cursor from before
    // this migration, the next run will re-start that entity from the
    // beginning. Cursors are opaque per-API so we can't translate.
    private async syncOrders(channelId: string, orgId: string, shopDomain: string, token: string) {
        const syncLog = await this.createSyncLog(channelId, orgId, 'orders');
        let processed = 0;
        let failed = 0;

        try {
            // Informational only (drives the totalEstimated progress UI).
            await this.updateTotalEstimated(syncLog.id, { shopDomain, accessToken: token }, ORDERS_COUNT_QUERY, 'ordersCount');

            const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
            const filters: string[] = [];
            if (channel?.lastSyncedAt) {
                filters.push(`updated_at:>='${channel.lastSyncedAt.toISOString()}'`);
            }
            const queryString = filters.length > 0 ? filters.join(' ') : null;

            const auth = { shopDomain, accessToken: token };
            for await (const page of this.paginateOrdersGraphql(auth, syncLog.cursor, queryString)) {
                for (const node of page.orders) {
                    try {
                        await this.drainLineItems(auth, node);
                        const so = this.transformGraphqlOrder(node);
                        await this.upsertOrder(channelId, orgId, so);
                        processed++;
                    } catch (error) {
                        failed++;
                        this.logger.error(`Failed order ${node.id}`, error);
                    }
                }
                await this.prisma.syncLog.update({
                    where: { id: syncLog.id },
                    data: { recordsProcessed: processed, recordsFailed: failed, cursor: page.nextCursor },
                });
            }
            await this.completeSyncLog(syncLog.id, processed, failed);
        } catch (error) {
            await this.failSyncLog(syncLog.id, processed, failed, error);
            throw error;
        }
    }

    // ─── ORDERS GRAPHQL PAGINATION ───
    // Yields each page of orders. Sorted by UPDATED_AT ascending so the cursor
    // checkpoint stored in syncLog walks forward chronologically — matches
    // the previous REST behavior of `updated_at_min` filtering.
    private async *paginateOrdersGraphql(
        auth: { shopDomain: string; accessToken: string },
        startCursor: string | null,
        queryString: string | null,
    ): AsyncGenerator<{ orders: OrderNode[]; nextCursor: string | null }> {
        let cursor: string | null = startCursor ?? null;
        let pageSize = GRAPHQL_PAGE_SIZE;
        do {
            const variables: OrdersListVariables = {
                first: pageSize,
                after: cursor,
                query: queryString,
                sortKey: 'UPDATED_AT',
                reverse: false,
            };
            let res: OrdersListResponse;
            try {
                res = await this.graphql.request<OrdersListResponse, OrdersListVariables>(
                    auth,
                    ORDERS_LIST_QUERY,
                    variables,
                );
            } catch (error) {
                // Shopify prices a query before running it and rejects anything
                // over its cap. Retrying identically can never succeed, but
                // asking for fewer orders can — and a cursor stays valid across
                // a changed `first`. Degrade instead of failing the whole sync.
                if (
                    error instanceof ShopifyGraphqlError &&
                    error.code === 'MAX_COST_EXCEEDED' &&
                    pageSize > 1
                ) {
                    pageSize = Math.max(1, Math.floor(pageSize / 2));
                    this.logger.warn(
                        `Orders query rejected as too costly; retrying same cursor with first=${pageSize}.`,
                    );
                    continue;
                }
                throw error;
            }
            const nextCursor = res.orders.pageInfo.hasNextPage
                ? res.orders.pageInfo.endCursor
                : null;
            yield { orders: res.orders.nodes, nextCursor };
            cursor = nextCursor;
        } while (cursor);
    }

    /**
     * Pull the remaining line items for an order that has more than the first
     * page, mutating `node.lineItems.nodes` in place.
     *
     * ORDERS_LIST_QUERY asks for 100. An order with more used to import a
     * subset with NO signal: `totalPrice` comes from Shopify so the header
     * stayed correct, while the GST invoice (built by walking line items)
     * understated the sale and vendors whose items fell in the missing tail
     * never saw the order. Raising the number is not a fix — Shopify caps it at
     * 250 and a bigger `first` costs more; draining is the fix.
     *
     * Orders within one page (all of them, in practice) issue zero extra calls.
     *
     * NOTE: `fulfillments`/`refunds` are plain list fields, not connections —
     * they expose no pageInfo and cannot be drained this way. Their 50-item
     * caps remain.
     */
    private async drainLineItems(
        auth: { shopDomain: string; accessToken: string },
        node: OrderNode,
    ): Promise<void> {
        let page = node.lineItems.pageInfo;
        let guard = 0;
        while (page?.hasNextPage && page.endCursor && guard++ < 50) {
            const res = await this.graphql.request<
                OrderLineItemsPageResponse,
                OrderLineItemsPageVariables
            >(auth, ORDER_LINE_ITEMS_PAGE_QUERY, {
                id: node.id,
                first: 100,
                after: page.endCursor,
            });
            const more = res.order?.lineItems;
            if (!more || more.nodes.length === 0) break;
            node.lineItems.nodes.push(...more.nodes);
            page = more.pageInfo;
        }
        if (guard > 0) {
            this.logger.log(
                `Order ${node.id}: drained ${node.lineItems.nodes.length} line items across ${guard + 1} pages.`,
            );
        }
    }

    // ─── GRAPHQL → REST SHAPE TRANSFORMER ───
    // Lets `upsertOrder` (also called from the REST webhook controller) keep
    // consuming the same snake_case object. When we eventually retire REST
    // webhooks too, `upsertOrder` can switch to consuming OrderNode directly
    // and this transformer can be deleted.
    private transformGraphqlOrder(node: OrderNode): Record<string, any> {
        const customer = node.customer
            ? {
                id: ShopifyGraphqlClient.extractId(node.customer.id),
                email: node.customer.email,
                first_name: node.customer.firstName,
                last_name: node.customer.lastName,
            }
            : null;

        const lineItems = node.lineItems.nodes.map((li) => ({
            id: ShopifyGraphqlClient.extractId(li.id),
            product_id: li.variant?.product?.id
                ? ShopifyGraphqlClient.extractId(li.variant.product.id)
                : null,
            variant_id: li.variant?.id
                ? ShopifyGraphqlClient.extractId(li.variant.id)
                : null,
            title: li.title,
            variant_title: li.variantTitle,
            sku: li.sku,
            quantity: li.quantity,
            price: li.originalUnitPriceSet?.shopMoney?.amount ?? '0',
            total_discount: li.totalDiscountSet?.shopMoney?.amount ?? '0',
            // `fulfillment_status` is intentionally omitted — GraphQL OrderLineItem
            // has no flat equivalent; leaving it `undefined` means the upsert
            // preserves any prior value rather than overwriting with null.
            requires_shipping: li.requiresShipping,
            taxable: li.taxable,
            properties: li.customAttributes?.length
                ? li.customAttributes.map((a) => ({ name: a.key, value: a.value }))
                : null,
        }));

        const fulfillments = node.fulfillments.map((ff) => {
            const track = ff.trackingInfo?.[0];
            return {
                id: ShopifyGraphqlClient.extractId(ff.id),
                status: ff.status ? ff.status.toLowerCase() : 'pending',
                tracking_number: track?.number ?? null,
                tracking_url: track?.url ?? null,
                tracking_company: track?.company ?? null,
                created_at: ff.createdAt,
            };
        });

        const refunds = node.refunds.map((rf) => ({
            id: ShopifyGraphqlClient.extractId(rf.id),
            note: rf.note,
            processed_at: rf.createdAt,
            refund_line_items: rf.refundLineItems?.nodes?.map((rli) => ({
                id: ShopifyGraphqlClient.extractId(rli.id),
                quantity: rli.quantity,
                line_item_id: ShopifyGraphqlClient.extractId(rli.lineItem.id),
                restock_type: rli.restockType,
            })) ?? null,
            transactions: [{ amount: rf.totalRefundedSet?.shopMoney?.amount ?? '0' }],
        }));

        return {
            id: ShopifyGraphqlClient.extractId(node.id),
            order_number: node.number,
            name: node.name,
            email: node.email,
            phone: node.phone,
            note: node.note,
            // `upsertOrder` calls `.split(',')` on `so.tags` — preserve REST shape.
            tags: Array.isArray(node.tags) ? node.tags.join(', ') : '',
            currency: node.currencyCode,
            subtotal_price: node.currentSubtotalPriceSet?.shopMoney?.amount ?? '0',
            total_price: node.totalPriceSet?.shopMoney?.amount ?? '0',
            total_tax: node.totalTaxSet?.shopMoney?.amount ?? '0',
            total_discounts: node.totalDiscountsSet?.shopMoney?.amount ?? '0',
            total_shipping_price_set: {
                shop_money: {
                    amount: node.totalShippingPriceSet?.shopMoney?.amount ?? '0',
                    currency_code:
                        node.totalShippingPriceSet?.shopMoney?.currencyCode ?? node.currencyCode,
                },
            },
            // Carried through so the pull path can rebadge a pushed offline
            // order, exactly as the webhook path does. Without these, a sync
            // that beats the webhook would still create a duplicate.
            source_identifier: node.sourceIdentifier ?? null,
            source_name: node.sourceName ?? null,
            financial_status: node.displayFinancialStatus
                ? node.displayFinancialStatus.toLowerCase()
                : null,
            // Shopify GraphQL surfaces UNFULFILLED as an explicit enum; REST returned
            // null in that case. Keep the existing mapper happy by mirroring REST.
            fulfillment_status:
                node.displayFulfillmentStatus === 'UNFULFILLED'
                    ? null
                    : node.displayFulfillmentStatus
                        ? node.displayFulfillmentStatus.toLowerCase()
                        : null,
            cancel_reason: node.cancelReason ? node.cancelReason.toLowerCase() : null,
            cancelled_at: node.cancelledAt,
            closed_at: node.closedAt,
            created_at: node.createdAt,
            updated_at: node.updatedAt,
            shipping_address: node.shippingAddress ? this.transformAddress(node.shippingAddress) : null,
            billing_address: node.billingAddress ? this.transformAddress(node.billingAddress) : null,
            customer,
            line_items: lineItems,
            fulfillments,
            refunds,
        };
    }

    private transformAddress(addr: MailingAddress): Record<string, any> {
        return {
            address1: addr.address1,
            address2: addr.address2,
            city: addr.city,
            province: addr.province,
            province_code: addr.provinceCode,
            country: addr.country,
            country_code: addr.countryCodeV2,
            zip: addr.zip,
            first_name: addr.firstName,
            last_name: addr.lastName,
            name: addr.name,
            phone: addr.phone,
            company: addr.company,
        };
    }

    // ─── SYNC CUSTOMERS ───
    private async syncCustomers(channelId: string, orgId: string, shopDomain: string, token: string) {
        const syncLog = await this.createSyncLog(channelId, orgId, 'customers');
        let processed = 0;
        let failed = 0;

        try {
            const auth = { shopDomain, accessToken: token };
            await this.updateTotalEstimated(syncLog.id, auth, CUSTOMERS_COUNT_QUERY, 'customersCount');

            for await (const page of this.paginateCustomersGraphql(auth, syncLog.cursor)) {
                for (const node of page.customers) {
                    try {
                        await this.upsertCustomer(channelId, orgId, this.transformGraphqlCustomer(node));
                        processed++;
                    } catch (error) {
                        failed++;
                        this.logger.error(`Failed customer ${node.id}`, error);
                    }
                }
                await this.prisma.syncLog.update({
                    where: { id: syncLog.id },
                    data: { recordsProcessed: processed, recordsFailed: failed, cursor: page.nextCursor },
                });
            }
            await this.completeSyncLog(syncLog.id, processed, failed);
        } catch (error) {
            await this.failSyncLog(syncLog.id, processed, failed, error);
            throw error;
        }
    }

    private async *paginateCustomersGraphql(
        auth: { shopDomain: string; accessToken: string },
        startCursor: string | null,
    ): AsyncGenerator<{ customers: CustomerSyncNode[]; nextCursor: string | null }> {
        let cursor: string | null = startCursor ?? null;
        do {
            const variables: CustomersListVariables = { first: GRAPHQL_PAGE_SIZE, after: cursor };
            const res = await this.graphql.request<CustomersListResponse, CustomersListVariables>(
                auth,
                CUSTOMERS_LIST_QUERY,
                variables,
            );
            const nextCursor = res.customers.pageInfo.hasNextPage
                ? res.customers.pageInfo.endCursor
                : null;
            yield { customers: res.customers.nodes, nextCursor };
            cursor = nextCursor;
        } while (cursor);
    }

    // GraphQL CustomerSyncNode → REST snake_case shape for `upsertCustomer`
    // (shared with the customers/* webhooks).
    private transformGraphqlCustomer(node: CustomerSyncNode): Record<string, any> {
        return {
            id: ShopifyGraphqlClient.extractId(node.id),
            email: node.email,
            first_name: node.firstName,
            last_name: node.lastName,
            phone: node.phone,
            state: node.state ? node.state.toLowerCase() : 'enabled',
            verified_email: node.verifiedEmail,
            accepts_marketing: node.emailMarketingConsent?.marketingState === 'SUBSCRIBED',
            orders_count: parseInt(node.numberOfOrders ?? '0', 10) || 0,
            total_spent: node.amountSpent?.amount ?? '0',
            // `upsertCustomer` splits on ',' — mirror the REST string shape.
            tags: Array.isArray(node.tags) ? node.tags.join(', ') : '',
            note: node.note,
            addresses: node.addresses?.length
                ? node.addresses.map((a) => this.transformAddress(a))
                : null,
            default_address: node.defaultAddress ? this.transformAddress(node.defaultAddress) : null,
            created_at: node.createdAt,
            updated_at: node.updatedAt,
        };
    }

    // ─── SYNC INVENTORY ───
    private async syncInventory(channelId: string, orgId: string, shopDomain: string, token: string) {
        const syncLog = await this.createSyncLog(channelId, orgId, 'inventory');
        let processed = 0;
        let failed = 0;

        // Warehousing orgs hold stock per warehouse, so the aggregate this
        // pass reads (variant.inventoryQuantity — Shopify's SUM across every
        // location) is the wrong number for them: it would flatten the split
        // into whichever warehouse happened to be written last. They get the
        // per-location reconcile instead, which owns its own sync log.
        //
        // This used to be an outright no-op ("Phase D"), which meant a
        // warehousing org's stock never updated from Shopify at all.
        if (await this.inventoryLedger.isWarehousingEnabled(orgId)) {
            await this.completeSyncLog(syncLog.id, 0, 0);
            await this.locationSync.pullLocationInventory(channelId, orgId, shopDomain, token);
            return;
        }

        try {
            const auth = { shopDomain, accessToken: token };
            let cursor: string | null = syncLog.cursor ?? null;
            do {
                const res: ProductsInventoryResponse = await this.graphql.request<ProductsInventoryResponse>(
                    auth,
                    PRODUCTS_INVENTORY_QUERY,
                    { first: GRAPHQL_PAGE_SIZE, after: cursor },
                );
                for (const product of res.products.nodes) {
                    for (const variant of product.variants.nodes) {
                        try {
                            const quantity = variant.inventoryQuantity ?? 0;
                            const existing = await this.prisma.productVariant.findFirst({
                                where: {
                                    externalId: ShopifyGraphqlClient.extractId(variant.id),
                                    product: { channelId },
                                },
                            });
                            if (existing && existing.inventoryQuantity !== quantity) {
                                await this.prisma.$transaction([
                                    this.prisma.productVariant.update({
                                        where: { id: existing.id },
                                        data: { inventoryQuantity: quantity },
                                    }),
                                    this.prisma.inventoryEvent.create({
                                        data: {
                                            organizationId: orgId, variantId: existing.id,
                                            quantityBefore: existing.inventoryQuantity,
                                            quantityAfter: quantity,
                                            changeAmount: quantity - existing.inventoryQuantity,
                                            reason: 'sync', referenceType: 'sync',
                                        },
                                    }),
                                ]);
                                processed++;
                            }
                        } catch (error) {
                            failed++;
                        }
                    }
                }
                cursor = res.products.pageInfo.hasNextPage ? res.products.pageInfo.endCursor : null;
                await this.prisma.syncLog.update({
                    where: { id: syncLog.id },
                    data: { recordsProcessed: processed, recordsFailed: failed, cursor },
                });
            } while (cursor);
            await this.completeSyncLog(syncLog.id, processed, failed);
        } catch (error) {
            await this.failSyncLog(syncLog.id, processed, failed, error);
            throw error;
        }
    }

    // ─── SYNC COLLECTIONS ───
    private async syncCollections(channelId: string, orgId: string, shopDomain: string, token: string) {
        const syncLog = await this.createSyncLog(channelId, orgId, 'collections');
        let processed = 0;
        let failed = 0;

        try {
            const auth = { shopDomain, accessToken: token };
            // One GraphQL connection covers custom AND smart collections —
            // `ruleSet` is non-null only for smart ones. Product membership
            // (previously REST `collects.json`) is inlined per collection.
            let cursor: string | null = syncLog.cursor ?? null;
            do {
                const res: CollectionsListResponse = await this.graphql.request<
                    CollectionsListResponse,
                    CollectionsListVariables
                >(auth, COLLECTIONS_LIST_QUERY, { first: 25, after: cursor });

                for (const node of res.collections.nodes) {
                    try {
                        const col = {
                            id: ShopifyGraphqlClient.extractId(node.id),
                            title: node.title,
                            handle: node.handle,
                            // GraphQL enum BEST_SELLING → REST "best-selling"
                            sort_order: node.sortOrder
                                ? node.sortOrder.toLowerCase().replace(/_/g, '-')
                                : null,
                            published_at: null,
                        };
                        await this.upsertCollection(
                            channelId, orgId, col,
                            node.ruleSet ? 'smart' : 'custom',
                        );
                        await this.syncCollectionProducts(channelId, auth, node);
                        processed++;
                    } catch (error) {
                        failed++;
                        this.logger.error(`Failed collection ${node.id}`, error);
                    }
                }

                cursor = res.collections.pageInfo.hasNextPage
                    ? res.collections.pageInfo.endCursor
                    : null;
                await this.prisma.syncLog.update({
                    where: { id: syncLog.id },
                    data: { recordsProcessed: processed, recordsFailed: failed, cursor },
                });
            } while (cursor);

            await this.completeSyncLog(syncLog.id, processed, failed);
        } catch (error) {
            await this.failSyncLog(syncLog.id, processed, failed, error);
            throw error;
        }
    }

    // Product-collection links (replaces REST `collects.json`). The first page
    // of product ids rides along on the collections query; oversized
    // collections are drained with COLLECTION_PRODUCTS_QUERY.
    private async syncCollectionProducts(
        channelId: string,
        auth: { shopDomain: string; accessToken: string },
        node: CollectionSyncNode,
    ): Promise<void> {
        const collection = await this.prisma.collection.findFirst({
            where: { channelId, externalId: ShopifyGraphqlClient.extractId(node.id) },
            select: { id: true },
        });
        if (!collection) return;

        let position = 0;
        let productNodes = node.products.nodes;
        let pageInfo: PageInfo = node.products.pageInfo;

        for (;;) {
            for (const p of productNodes) {
                position++;
                const product = await this.prisma.product.findFirst({
                    where: { channelId, externalId: ShopifyGraphqlClient.extractId(p.id) },
                    select: { id: true },
                });
                if (!product) continue;
                await this.prisma.productCollection.upsert({
                    where: { productId_collectionId: { productId: product.id, collectionId: collection.id } },
                    create: { productId: product.id, collectionId: collection.id, position },
                    update: { position },
                });
            }
            if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
            const res = await this.graphql.request<CollectionProductsResponse>(
                auth,
                COLLECTION_PRODUCTS_QUERY,
                { id: node.id, first: 100, after: pageInfo.endCursor },
            );
            productNodes = res.collection?.products.nodes ?? [];
            pageInfo = res.collection?.products.pageInfo ?? { hasNextPage: false, endCursor: null };
        }
    }

    // ─── UPSERT HELPERS ───

    async upsertProduct(channelId: string, orgId: string, sp: any, vendorKey?: string | null) {
        const externalId = String(sp.id);
        const tags = sp.tags ? sp.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
        // Only touch vendor_key when a value was resolved (string|null). undefined = leave as-is.
        const vendorKeyUpdate = vendorKey === undefined ? {} : { vendorKey };

        // Shopify signals "no real options" with a placeholder option named
        // "Title" whose only value is "Default Title". Store null instead —
        // our convention for single-variant products — so the UI never renders
        // a fake "Title" option. (The CSV importer already filters this; the
        // pull path must match.)
        const isPlaceholderOptions =
            Array.isArray(sp.options) &&
            sp.options.length === 1 &&
            sp.options[0]?.name === 'Title' &&
            Array.isArray(sp.options[0]?.values) &&
            sp.options[0].values.length === 1 &&
            sp.options[0].values[0] === 'Default Title';
        const normalizedOptions = isPlaceholderOptions ? null : (sp.options || null);

        const product = await this.prisma.product.upsert({
            where: { channelId_externalId: { channelId, externalId } },
            create: {
                organizationId: orgId, channelId, externalId,
                title: sp.title, bodyHtml: sp.body_html, vendor: sp.vendor, vendorKey: vendorKey ?? null,
                productType: sp.product_type, status: this.mapProductStatus(sp.status),
                tags, options: normalizedOptions,
                publishedAt: sp.published_at ? new Date(sp.published_at) : null,
                externalCreatedAt: sp.created_at ? new Date(sp.created_at) : null,
                externalUpdatedAt: sp.updated_at ? new Date(sp.updated_at) : null,
            },
            update: {
                title: sp.title, bodyHtml: sp.body_html, vendor: sp.vendor, ...vendorKeyUpdate,
                productType: sp.product_type, status: this.mapProductStatus(sp.status),
                tags, options: normalizedOptions,
                publishedAt: sp.published_at ? new Date(sp.published_at) : null,
                externalUpdatedAt: sp.updated_at ? new Date(sp.updated_at) : null,
            },
        });

        // Warehousing orgs: variant.inventoryQuantity is a derived cache
        // (SUM of StockLevel.available) — the product pull must never stomp
        // it. Quantity reconciliation for those orgs is the Phase D drift
        // flow. Legacy orgs keep the pull-writes-quantity behavior, now WITH
        // ledger events (previously this path mutated stock silently).
        const warehousing = await this.inventoryLedger.isWarehousingEnabled(orgId);
        const priorVariants = await this.prisma.productVariant.findMany({
            where: { productId: product.id },
            select: { externalId: true, inventoryQuantity: true, sku: true },
        });
        const priorByExt = new Map(priorVariants.map((v) => [v.externalId, v]));

        for (const sv of sp.variants || []) {
            const incomingQty = sv.inventory_quantity ?? 0;
            const prior = priorByExt.get(String(sv.id));
            const row = await this.prisma.productVariant.upsert({
                where: { productId_externalId: { productId: product.id, externalId: String(sv.id) } },
                create: {
                    productId: product.id, organizationId: orgId,
                    externalId: String(sv.id), title: sv.title || 'Default',
                    sku: sv.sku, barcode: sv.barcode, price: sv.price,
                    compareAtPrice: sv.compare_at_price,
                    inventoryQuantity: warehousing ? 0 : incomingQty,
                    inventoryItemId: sv.inventory_item_id ? String(sv.inventory_item_id) : null,
                    weight: sv.weight ? String(sv.weight) : null, weightUnit: sv.weight_unit,
                    option1: sv.option1, option2: sv.option2, option3: sv.option3,
                    position: sv.position ?? 1, requiresShipping: sv.requires_shipping ?? true,
                    taxable: sv.taxable ?? true,
                },
                update: {
                    title: sv.title || 'Default', sku: sv.sku, barcode: sv.barcode,
                    price: sv.price, compareAtPrice: sv.compare_at_price,
                    ...(warehousing ? {} : { inventoryQuantity: incomingQty }),
                    inventoryItemId: sv.inventory_item_id ? String(sv.inventory_item_id) : undefined,
                    weight: sv.weight ? String(sv.weight) : null, weightUnit: sv.weight_unit,
                    option1: sv.option1, option2: sv.option2, option3: sv.option3, position: sv.position ?? 1,
                },
            });
            if (!warehousing) {
                const before = prior?.inventoryQuantity ?? 0;
                if (before !== incomingQty) {
                    await this.inventoryLedger.recordQuantityChange(this.prisma, {
                        orgId,
                        variantId: row.id,
                        quantityBefore: before,
                        quantityAfter: incomingQty,
                        reason: 'sync',
                        referenceType: 'product_sync',
                        referenceId: externalId,
                        sku: row.sku,
                    });
                }
            }
        }

        for (const si of sp.images || []) {
            await this.prisma.productImage.upsert({
                where: { productId_externalId: { productId: product.id, externalId: String(si.id) } },
                create: { productId: product.id, externalId: String(si.id), src: si.src, alt: si.alt, position: si.position ?? 1 },
                update: { src: si.src, alt: si.alt, position: si.position ?? 1 },
            });
        }
    }

    async upsertOrder(channelId: string, orgId: string, so: any) {
        const externalId = String(so.id);

        let customerId: string | null = null;
        if (so.customer?.id) {
            const customer = await this.prisma.customer.findFirst({ where: { channelId, externalId: String(so.customer.id) } });
            if (customer) {
                customerId = customer.id;
            } else {
                try {
                    const stub = await this.prisma.customer.create({
                        data: { organizationId: orgId, channelId, externalId: String(so.customer.id), email: so.customer.email, firstName: so.customer.first_name, lastName: so.customer.last_name },
                    });
                    customerId = stub.id;
                } catch {
                    // Create can fail on (channelId, externalId) — a concurrent
                    // stub — OR on the org-level (organizationId, email) unique
                    // when a row with this email exists from a previous channel
                    // connection. Link the order to whichever row matches; the
                    // customers sync pass fully adopts it later.
                    const existing = await this.prisma.customer.findFirst({
                        where: {
                            OR: [
                                { channelId, externalId: String(so.customer.id) },
                                ...(so.customer.email
                                    ? [{ organizationId: orgId, email: so.customer.email }]
                                    : []),
                            ],
                        },
                        select: { id: true },
                    });
                    customerId = existing?.id ?? null;
                }
            }
        }

        const tags = so.tags ? so.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
        const shippingPrice = so.total_shipping_price_set?.shop_money?.amount ?? so.total_shipping_price ?? '0';

        // REBADGE: is this an offline order WE pushed, coming back to us?
        //
        // `pushOrder` stamps the Shopify order with sourceIdentifier = the local
        // order id. Without reading it back, the `orders/create` webhook for an
        // order we just created finds no row under (shopifyChannel, shopifyId)
        // and inserts a SECOND one — so every pushed counter sale existed twice
        // and was counted twice in revenue, top products and customer totals.
        //
        // Adopt the existing row instead: re-point it at the Shopify identity
        // and let the upsert below take its normal update branch. Adopting
        // Shopify's number/name is deliberate — the row IS the Shopify order
        // now, and dropping the `manual_` externalId also moves it cleanly out
        // of the manual order-number index.
        //
        // Local ids are cuids, so a foreign source_identifier cannot collide;
        // the MANUAL-platform filter closes the remaining gap.
        let existing = await this.prisma.order.findUnique({
            where: { channelId_externalId: { channelId, externalId } },
            select: { id: true, externalUpdatedAt: true },
        });
        if (
            !existing &&
            so.source_identifier &&
            (!so.source_name || so.source_name === 'collabo-crm')
        ) {
            const pushedLocally = await this.prisma.order.findFirst({
                where: {
                    id: String(so.source_identifier),
                    organizationId: orgId,
                    channel: { platform: ChannelPlatform.MANUAL },
                },
                select: { id: true, name: true, customerId: true, externalUpdatedAt: true },
            });
            if (pushedLocally) {
                await this.prisma.order.update({
                    where: { id: pushedLocally.id },
                    data: {
                        channelId,
                        externalId,
                        orderNumber: so.order_number,
                        name: so.name || `#${so.order_number}`,
                    },
                });
                // Keep the buyer we already know. The upsert below runs its
                // UPDATE branch on this row and would write `customerId: null`
                // for a walk-in sale (Shopify carries no customer, so the
                // lookup above resolved none) — orphaning the order from the
                // customer whose revenue it counts towards. A customer the
                // payload DOES resolve still wins.
                if (!customerId) customerId = pushedLocally.customerId;
                // The row now answers to the Shopify identity, so the write
                // below must take its UPDATE path, not insert a second row.
                existing = {
                    id: pushedLocally.id,
                    externalUpdatedAt: pushedLocally.externalUpdatedAt,
                };
                this.logger.log(
                    `Rebadged locally-pushed order ${pushedLocally.name} (${pushedLocally.id}) ` +
                    `as Shopify order ${externalId} — no duplicate created.`,
                );
            }
        }

        // Resolve every variant/product the payload references in TWO reads.
        // The line-item loop used to issue up to three serial queries per item;
        // these run before the transaction opens, so the transaction below
        // contains writes only and stays short.
        const payloadLines: any[] = Array.isArray(so.line_items) ? so.line_items : [];
        const variantExternalIds = [
            ...new Set(
                payloadLines.filter((li) => li.variant_id).map((li) => String(li.variant_id)),
            ),
        ];
        const productExternalIds = [
            ...new Set(
                payloadLines.filter((li) => li.product_id).map((li) => String(li.product_id)),
            ),
        ];
        const [variantRows, productRows] = await Promise.all([
            variantExternalIds.length
                ? this.prisma.productVariant.findMany({
                    where: { externalId: { in: variantExternalIds }, product: { channelId } },
                    select: {
                        id: true,
                        externalId: true,
                        product: { select: { vendor: true, vendorKey: true } },
                    },
                })
                : Promise.resolve([]),
            productExternalIds.length
                ? this.prisma.product.findMany({
                    where: { channelId, externalId: { in: productExternalIds } },
                    select: { externalId: true, vendor: true, vendorKey: true },
                })
                : Promise.resolve([]),
        ]);
        const variantByExternalId = new Map(variantRows.map((v) => [v.externalId, v] as const));
        const productByExternalId = new Map(productRows.map((p) => [p.externalId, p] as const));

        const incomingUpdatedAt = so.updated_at ? new Date(so.updated_at) : null;

        // What an UPDATE is allowed to touch.
        //
        // `customerId`, `shippingAddress` and `billingAddress` are conditional
        // on purpose. They used to be written unconditionally, so a payload
        // that carried none of them wrote NULL over what we already held —
        // which destroys real data for any order that started life here: a
        // counter sale pushed to Shopify and rebadged holds a buyer and a
        // delivery address Shopify never learned about. A value Shopify DOES
        // send still wins. The trade-off is deliberate: removing a customer or
        // an address in Shopify no longer clears it locally.
        //
        // `subtotalPrice`/`currency` were missing from the update path
        // altogether, so an order edited in Shopify kept its original subtotal
        // for ever while its total moved.
        //
        // `cancelledAt`/`closedAt`/`tags` stay unconditional — Shopify is the
        // authority on those, and making them sticky would stop an un-cancel
        // or a removed tag from ever propagating.
        const patch: Prisma.OrderUncheckedUpdateManyInput = {
            financialStatus: this.mapFinancialStatus(so.financial_status),
            fulfillmentStatus: this.mapFulfillmentStatus(so.fulfillment_status),
            totalPrice: so.total_price || '0', totalTax: so.total_tax || '0',
            totalDiscounts: so.total_discounts || '0', totalShippingPrice: shippingPrice,
            subtotalPrice: so.subtotal_price ?? undefined,
            currency: so.currency ?? undefined,
            note: so.note, tags,
            cancelReason: this.mapCancelReason(so.cancel_reason),
            cancelledAt: so.cancelled_at ? new Date(so.cancelled_at) : null,
            closedAt: so.closed_at ? new Date(so.closed_at) : null,
            externalUpdatedAt: incomingUpdatedAt,
            ...(customerId ? { customerId } : {}),
            ...(so.shipping_address ? { shippingAddress: so.shipping_address } : {}),
            ...(so.billing_address ? { billingAddress: so.billing_address } : {}),
        };

        // One transaction for the order and all of its children. Previously the
        // header, line items, fulfillments and refunds were four independent
        // commits, so a failure part-way left a half-written order that the
        // Shopify retry then landed on top of.
        await this.prisma.$transaction(async (tx) => {
            let orderId: string;

            if (!existing) {
                // upsert, not create: two webhooks for a brand-new order can
                // race, and (channelId, externalId) is unique.
                const created = await tx.order.upsert({
                    where: { channelId_externalId: { channelId, externalId } },
                    create: {
                        organizationId: orgId, channelId, customerId, externalId,
                        orderNumber: so.order_number, name: so.name || `#${so.order_number}`,
                        financialStatus: this.mapFinancialStatus(so.financial_status),
                        fulfillmentStatus: this.mapFulfillmentStatus(so.fulfillment_status),
                        currency: so.currency || 'USD', subtotalPrice: so.subtotal_price || '0',
                        totalPrice: so.total_price || '0', totalTax: so.total_tax || '0',
                        totalDiscounts: so.total_discounts || '0', totalShippingPrice: shippingPrice,
                        shippingAddress: so.shipping_address || null, billingAddress: so.billing_address || null,
                        note: so.note, tags,
                        cancelReason: this.mapCancelReason(so.cancel_reason),
                        cancelledAt: so.cancelled_at ? new Date(so.cancelled_at) : null,
                        closedAt: so.closed_at ? new Date(so.closed_at) : null,
                        externalCreatedAt: so.created_at ? new Date(so.created_at) : null,
                        externalUpdatedAt: incomingUpdatedAt,
                    },
                    update: patch,
                    select: { id: true },
                });
                orderId = created.id;
            } else {
                // Compare-and-set on `externalUpdatedAt`. It was written on
                // every upsert and never read, so an `orders/create` arriving
                // after its own `orders/updated` silently reverted the order —
                // a fulfilled order flipping back to unfulfilled, with nothing
                // logged. `lte` (not `lt`) keeps an identical redelivery
                // idempotent instead of making it look like a conflict.
                const applied = await tx.order.updateMany({
                    where: {
                        id: existing.id,
                        ...(incomingUpdatedAt
                            ? {
                                OR: [
                                    { externalUpdatedAt: null },
                                    { externalUpdatedAt: { lte: incomingUpdatedAt } },
                                ],
                            }
                            : {}),
                    },
                    data: patch,
                });
                if (applied.count === 0) {
                    // Deliberately returns before the children are written —
                    // a stale payload must not rewrite line items either.
                    this.logger.debug(
                        `Stale Shopify payload for order ${externalId} (updated_at=${so.updated_at}) — newer state already stored, skipping.`,
                    );
                    return;
                }
                orderId = existing.id;
            }

            await this.writeOrderChildren(tx, orderId, so, payloadLines, {
                variantByExternalId,
                productByExternalId,
            });
        }, { timeout: 20000 });
    }

    /**
     * Write an order's line items, fulfillments and refunds. Split out of
     * `upsertOrder` so the transaction body stays readable; every lookup it
     * needs has already been resolved into the maps it is handed, so it issues
     * writes only.
     *
     * Line items are reconciled — a line removed in Shopify is removed here —
     * under the guards documented at the delete below. Fulfillments and refunds
     * are upsert-only and must stay that way: they arrive capped at 50 with no
     * cursor to page them, so their arrays can never be treated as complete and
     * "delete what's missing" would destroy records beyond the cap. The known,
     * accepted cost is that a shipment cancelled in Shopify lingers locally.
     */
    private async writeOrderChildren(
        tx: Prisma.TransactionClient,
        orderId: string,
        so: any,
        payloadLines: any[],
        maps: {
            variantByExternalId: Map<string, { id: string; product: { vendor: string | null; vendorKey: string | null } | null }>;
            productByExternalId: Map<string, { vendor: string | null; vendorKey: string | null }>;
        },
    ): Promise<void> {
        for (const li of payloadLines) {
            const variant = li.variant_id
                ? maps.variantByExternalId.get(String(li.variant_id))
                : undefined;
            // Fallback when the variant is gone, or when it carries no vendor:
            // resolve via the product's external id.
            const product = li.product_id
                ? maps.productByExternalId.get(String(li.product_id))
                : undefined;
            const variantId = variant?.id ?? null;
            const vendor =
                variant?.product?.vendorKey ??
                variant?.product?.vendor ??
                product?.vendorKey ??
                product?.vendor ??
                null;

            await tx.orderLineItem.upsert({
                where: { orderId_externalId: { orderId, externalId: String(li.id) } },
                create: {
                    orderId, variantId, externalId: String(li.id),
                    externalProductId: li.product_id ? String(li.product_id) : null,
                    externalVariantId: li.variant_id ? String(li.variant_id) : null,
                    title: li.title || 'Unknown', variantTitle: li.variant_title, sku: li.sku, vendor,
                    quantity: li.quantity, price: li.price || '0', totalDiscount: li.total_discount || '0',
                    fulfillmentStatus: li.fulfillment_status, requiresShipping: li.requires_shipping ?? true,
                    taxable: li.taxable ?? true, properties: li.properties || null,
                },
                update: { variantId, vendor, title: li.title || 'Unknown', quantity: li.quantity, price: li.price || '0', totalDiscount: li.total_discount || '0', fulfillmentStatus: li.fulfillment_status },
            });
        }

        // H2: drop line items Shopify no longer lists. Without this an item
        // removed from an order in Shopify survives here for ever — order
        // totals stay right (they come from the header) but everything counted
        // FROM items keeps counting it: top-selling products, units sold,
        // sales by category, vendor splits.
        //
        // Three guards, each of which the naive one-liner gets wrong:
        //
        //  1. Only when the payload actually listed something. An empty array
        //     means "no information", not "this order has no items" —
        //     `transformGraphqlOrder` always emits `line_items`, `[]` included,
        //     so an unguarded delete would wipe every item on the first pull
        //     that came back empty.
        //  2. Never at or above LINE_ITEM_RECONCILE_CAP. Shopify does not
        //     document that a webhook payload carries every line of a very
        //     large order (its published tool for oversized payloads,
        //     `include_fields`, only REDUCES what you receive), so completeness
        //     is unproven up there. Below the cap the payload is trustworthy;
        //     at or above it we skip and say so.
        //  3. Deletions are logged. This is the one operation here that can
        //     destroy data, so it should never happen silently.
        //
        // Safe to delete: no foreign key references `order_line_items`, and
        // refund line snapshots are JSON rather than links.
        if (payloadLines.length > 0) {
            if (payloadLines.length >= LINE_ITEM_RECONCILE_CAP) {
                this.logger.warn(
                    `Order ${so.id} arrived with ${payloadLines.length} line items — at or above the ${LINE_ITEM_RECONCILE_CAP} reconcile cap, ` +
                    `so removed lines were NOT pruned (the payload may be truncated).`,
                );
            } else {
                const removed = await tx.orderLineItem.deleteMany({
                    where: {
                        orderId,
                        externalId: { notIn: payloadLines.map((li) => String(li.id)) },
                    },
                });
                if (removed.count > 0) {
                    this.logger.warn(
                        `Removed ${removed.count} line item(s) from order ${so.id} that Shopify no longer lists.`,
                    );
                }
            }
        }

        for (const ff of so.fulfillments || []) {
            await tx.orderFulfillment.upsert({
                where: { orderId_externalId: { orderId, externalId: String(ff.id) } },
                create: { orderId, externalId: String(ff.id), status: ff.status || 'pending', trackingNumber: ff.tracking_number, trackingUrl: ff.tracking_url, trackingCompany: ff.tracking_company, shippedAt: ff.created_at ? new Date(ff.created_at) : null },
                update: { status: ff.status || 'pending', trackingNumber: ff.tracking_number, trackingUrl: ff.tracking_url, trackingCompany: ff.tracking_company },
            });
        }

        for (const rf of so.refunds || []) {
            const refundAmount = rf.transactions?.[0]?.amount || '0';
            await tx.orderRefund.upsert({
                where: { orderId_externalId: { orderId, externalId: String(rf.id) } },
                create: { orderId, externalId: String(rf.id), amount: refundAmount, currency: so.currency || 'USD', reason: rf.note, note: rf.note, lineItems: rf.refund_line_items || null, processedAt: rf.processed_at ? new Date(rf.processed_at) : null },
                update: { amount: refundAmount, note: rf.note, lineItems: rf.refund_line_items || null },
            });
        }
    }

    /**
     * Persist a standalone `refunds/create` payload.
     *
     * Refund rows could already be written, but only when refund data happened
     * to ride along inside an order payload — there was no subscription, so a
     * refund issued in Shopify admin reached us only if Shopify also sent
     * `orders/updated`. Storage only: revenue aggregates stay gross for now.
     *
     * Idempotent via the `(orderId, externalId)` unique, so a redelivery is a
     * no-op. Uses the same shape as the refund write in `writeOrderChildren`
     * so the two paths cannot drift.
     */
    async upsertRefund(channelId: string, refund: any): Promise<void> {
        const orderExternalId = refund?.order_id ? String(refund.order_id) : null;
        if (!orderExternalId || !refund?.id) {
            this.logger.warn('refunds/create payload had no order_id or id — skipping.');
            return;
        }

        const order = await this.prisma.order.findUnique({
            where: { channelId_externalId: { channelId, externalId: orderExternalId } },
            select: { id: true, currency: true },
        });
        if (!order) {
            // The parent order may simply not be synced yet; `upsertOrder`
            // picks the refund up from the order payload when it arrives.
            this.logger.warn(
                `refunds/create for order ${orderExternalId}, which is not synced on channel ${channelId} — skipping.`,
            );
            return;
        }

        const amount = refund.transactions?.[0]?.amount ?? '0';
        await this.prisma.orderRefund.upsert({
            where: { orderId_externalId: { orderId: order.id, externalId: String(refund.id) } },
            create: {
                orderId: order.id, externalId: String(refund.id), amount,
                currency: order.currency, reason: refund.note, note: refund.note,
                lineItems: refund.refund_line_items ?? null,
                processedAt: refund.processed_at ? new Date(refund.processed_at) : null,
            },
            update: { amount, note: refund.note, lineItems: refund.refund_line_items ?? null },
        });
        this.logger.log(`Recorded refund ${refund.id} on order ${orderExternalId}.`);
    }

    /**
     * Upsert a Shopify DraftOrder payload (webhook or one-shot fetch) into
     * our DraftOrder table. Idempotent — keyed by (channelId, externalId).
     * Line item snapshots are rebuilt on every upsert; the previous set is
     * deleted first.
     *
     * Only fields we read from Shopify are written; CRM-only fields
     * (placeOfSupplyCode, completedOrderId, etc.) are preserved.
     */
    async upsertDraftOrder(channelId: string, orgId: string, sd: any) {
        const externalId = String(sd.id);

        // Resolve customer (if any). Shopify drafts use the same Customer
        // resource — match by externalId on the same channel.
        let customerId: string | null = null;
        if (sd.customer?.id) {
            const customer = await this.prisma.customer.findFirst({
                where: { channelId, externalId: String(sd.customer.id) },
                select: { id: true },
            });
            customerId = customer?.id ?? null;
        }

        const tags = Array.isArray(sd.tags)
            ? sd.tags
            : sd.tags
                ? sd.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
                : [];

        // Map Shopify status enum strings to ours. "open" → OPEN,
        // "invoice_sent" → INVOICE_SENT, "completed" → COMPLETED. Default to OPEN.
        const statusMap: Record<string, 'OPEN' | 'INVOICE_SENT' | 'COMPLETED'> = {
            open: 'OPEN',
            invoice_sent: 'INVOICE_SENT',
            completed: 'COMPLETED',
        };
        const status =
            (statusMap[sd.status?.toLowerCase?.() as string] ?? 'OPEN') as
                | 'OPEN'
                | 'INVOICE_SENT'
                | 'COMPLETED';

        // Find the local row (if any) so we don't reset fields the merchant
        // already filled (e.g. completedOrderId set by our completion flow).
        const existing = await this.prisma.draftOrder.findUnique({
            where: { channelId_externalId: { channelId, externalId } },
            select: { id: true },
        });

        const shared = {
            customerId,
            customerEmail: sd.email ?? null,
            name: sd.name ?? null,
            status,
            currency: sd.currency || 'USD',
            subtotalPrice: sd.subtotal_price || '0',
            totalPrice: sd.total_price || '0',
            totalTax: sd.total_tax || '0',
            totalDiscounts: sd.total_discounts || '0',
            totalShippingPrice:
                sd.shipping_line?.price ?? sd.total_shipping_price ?? '0',
            // Carried so draft completion can hand them to the real order.
            // Without these a Shopify-mirrored draft completes into an order
            // with no address, which leaves the GST invoice's buyer address
            // blank and drops the delivery state out of place-of-supply
            // resolution (so an interstate order is taxed CGST+SGST).
            shippingAddress: sd.shipping_address ?? null,
            billingAddress: sd.billing_address ?? null,
            note: sd.note ?? null,
            tags,
            invoiceUrl: sd.invoice_url ?? null,
            invoiceSentAt: sd.invoice_sent_at
                ? new Date(sd.invoice_sent_at)
                : null,
            completedAt: sd.completed_at ? new Date(sd.completed_at) : null,
            externalUpdatedAt: sd.updated_at ? new Date(sd.updated_at) : new Date(),
        };

        const draft = existing
            ? await this.prisma.draftOrder.update({
                  where: { id: existing.id },
                  data: shared,
              })
            : await this.prisma.draftOrder.create({
                  data: {
                      organizationId: orgId,
                      channelId,
                      externalId,
                      externalCreatedAt: sd.created_at
                          ? new Date(sd.created_at)
                          : new Date(),
                      ...shared,
                  },
              });

        // Rebuild line items from the webhook payload. Shopify line items
        // have stable ids per-draft, so deleting + re-creating is safe.
        await this.prisma.draftOrderLineItem.deleteMany({
            where: { draftOrderId: draft.id },
        });
        if (Array.isArray(sd.line_items) && sd.line_items.length > 0) {
            for (const li of sd.line_items) {
                let variantId: string | null = null;
                if (li.variant_id) {
                    const variant = await this.prisma.productVariant.findFirst({
                        where: {
                            externalId: String(li.variant_id),
                            product: { channelId },
                        },
                        select: { id: true },
                    });
                    variantId = variant?.id ?? null;
                }
                await this.prisma.draftOrderLineItem.create({
                    data: {
                        draftOrderId: draft.id,
                        variantId,
                        externalId: li.id ? String(li.id) : null,
                        title: li.title || 'Unknown',
                        variantTitle: li.variant_title ?? null,
                        sku: li.sku ?? null,
                        quantity: li.quantity ?? 1,
                        price: li.price || '0',
                        totalDiscount: li.total_discount || '0',
                        taxable: li.taxable ?? true,
                        requiresShipping: li.requires_shipping ?? true,
                    },
                });
            }
        }

        return draft;
    }

    async upsertCustomer(channelId: string, orgId: string, sc: any) {
        const externalId = String(sc.id);
        const tags = sc.tags ? sc.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];

        const updateFields = {
            email: sc.email, firstName: sc.first_name, lastName: sc.last_name, phone: sc.phone,
            state: this.mapCustomerState(sc.state), verifiedEmail: sc.verified_email ?? false,
            acceptsMarketing: sc.accepts_marketing ?? false,
            tags, note: sc.note,
            addresses: sc.addresses || null, defaultAddress: sc.default_address || null,
            externalUpdatedAt: sc.updated_at ? new Date(sc.updated_at) : null,
            // NOTE: ordersCount / totalSpent are deliberately NOT written from
            // sc.orders_count / sc.total_spent. Those figures describe Shopify
            // orders only, so writing them wholesale wiped every in-store
            // purchase for a customer who shops on both channels. Both fields
            // are derived from the local order table by
            // LoyaltyService.recomputeForCustomer, called at the end of this
            // method — which also assigns vipLevel from the org thresholds.
            // internalNotes, segments are still NOT overwritten (CRM-only fields).
        };

        let customer: { id: string };
        try {
            customer = await this.prisma.customer.upsert({
                where: { channelId_externalId: { channelId, externalId } },
                create: {
                    organizationId: orgId, channelId, externalId,
                    ...updateFields,
                    externalCreatedAt: sc.created_at ? new Date(sc.created_at) : null,
                },
                update: updateFields,
                select: { id: true },
            });
        } catch (err) {
            // Customer also has a unique (organizationId, email). A row with
            // this email can already exist under a DIFFERENT (channel,
            // externalId) identity — e.g. the store was reconnected as a new
            // channel, or Shopify holds two customer records sharing an email
            // (guest checkout / merged accounts). Adopt that row: re-point it
            // to the current identity and update its fields, preserving all
            // CRM-side data attached to it.
            if (
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002' &&
                sc.email
            ) {
                const existing = await this.prisma.customer.findFirst({
                    where: { organizationId: orgId, email: sc.email },
                    select: { id: true },
                });
                if (!existing) throw err;
                customer = await this.prisma.customer.update({
                    where: { id: existing.id },
                    data: { channelId, externalId, ...updateFields },
                    select: { id: true },
                });
                this.logger.log(
                    `Customer ${externalId} adopted existing row ${existing.id} by email match`,
                );
            } else {
                throw err;
            }
        }

        // Auto-tier the customer against the org's loyalty thresholds.
        // Failures here must not fail the whole customer sync.
        await this.loyalty.recomputeForCustomer(customer.id, orgId).catch((err) => {
            this.logger.warn(`Loyalty recompute failed for customer ${customer.id}: ${err?.message ?? err}`);
        });
    }

    private async upsertCollection(channelId: string, orgId: string, col: any, collectionType: string) {
        const externalId = String(col.id);
        await this.prisma.collection.upsert({
            where: { channelId_externalId: { channelId, externalId } },
            create: {
                organizationId: orgId, channelId, externalId,
                title: col.title, handle: col.handle, collectionType,
                sortOrder: col.sort_order,
                publishedAt: col.published_at ? new Date(col.published_at) : null,
            },
            update: {
                title: col.title, handle: col.handle,
                sortOrder: col.sort_order,
                publishedAt: col.published_at ? new Date(col.published_at) : null,
            },
        });
    }

    // ─── COUNT HELPER ───
    // Informational only — drives the totalEstimated progress UI. A failed
    // count must never fail the sync (some shops/plans gate count fields).
    private async updateTotalEstimated(
        logId: string,
        auth: { shopDomain: string; accessToken: string },
        query: string,
        field: 'productsCount' | 'customersCount' | 'ordersCount',
    ): Promise<void> {
        try {
            const res = await this.graphql.request<Record<string, { count: number } | null>>(auth, query);
            await this.prisma.syncLog.update({
                where: { id: logId },
                data: { totalEstimated: res?.[field]?.count ?? 0 },
            });
        } catch (err) {
            this.logger.warn(
                `Count query ${field} failed (non-fatal): ${err instanceof Error ? err.message : err}`,
            );
        }
    }

    // ─── VENDOR METAFIELD (multi-vendor routing) ───

    /** Per-org vendor metafield config, or null when the feature is disabled. */
    private async getVendorMetafieldConfig(
        orgId: string,
    ): Promise<{ namespace: string; key: string } | null> {
        const row = await this.prisma.organizationSettings.findUnique({
            where: { organizationId: orgId },
            select: { productSettings: true },
        });
        const ps = parseProductSettings(row?.productSettings ?? null);
        if (!ps.vendorMetafieldEnabled) return null;
        return { namespace: ps.vendorMetafieldNamespace, key: ps.vendorMetafieldKey };
    }

    // ─── SYNC LOG HELPERS ───
    /**
     * Open (or reopen) the log this sync will checkpoint into.
     *
     * Two defects used to live here, mirror images of one another:
     *
     *  - `failSyncLog` deliberately preserves the pagination cursor, but this
     *    lookup only matched `IN_PROGRESS`, so a FAILED log was invisible and
     *    its cursor unreachable. Every retry restarted at page 1 — three times
     *    per trigger, given `attempts: 3` — so a large store failing near the
     *    end could never finish.
     *  - Conversely a crashed process leaves a log pinned at `IN_PROGRESS`
     *    for ever, and that one WAS resumed, with no age check, potentially
     *    days later against a cursor Shopify has long since expired.
     *
     * So: resume only what is genuinely resumable — recent, and holding a
     * cursor — and retire anything stale instead of resurrecting it.
     */
    private async createSyncLog(channelId: string, orgId: string, entityType: string) {
        const cutoff = new Date(Date.now() - SYNC_RESUME_MAX_AGE_MS);
        const candidate = await this.prisma.syncLog.findFirst({
            where: {
                channelId,
                entityType,
                status: { in: [SyncStatus.IN_PROGRESS, SyncStatus.FAILED] },
            },
            orderBy: { createdAt: 'desc' },
        });

        if (candidate) {
            const resumable = candidate.startedAt > cutoff && !!candidate.cursor;
            if (resumable) {
                if (candidate.status === SyncStatus.FAILED) {
                    // Reopen it so progress reporting stays coherent while the
                    // retry walks on from the saved cursor.
                    const reopened = await this.prisma.syncLog.update({
                        where: { id: candidate.id },
                        data: { status: SyncStatus.IN_PROGRESS, completedAt: null, errorMessage: null },
                    });
                    this.logger.log(
                        `Resuming ${entityType} sync for channel ${channelId} from the cursor saved by its failed run.`,
                    );
                    return reopened;
                }
                return candidate;
            }

            if (candidate.status === SyncStatus.IN_PROGRESS) {
                // Stale and pinned: retire it so it stops being picked up, and
                // so the channel-level guard can tell dead from live.
                await this.prisma.syncLog.update({
                    where: { id: candidate.id },
                    data: {
                        status: SyncStatus.FAILED,
                        completedAt: new Date(),
                        errorMessage:
                            candidate.errorMessage ??
                            'Abandoned: still marked in progress when a later sync started (process likely died mid-run).',
                    },
                });
                this.logger.warn(
                    `Retired a stale IN_PROGRESS ${entityType} sync log for channel ${channelId} (started ${candidate.startedAt.toISOString()}).`,
                );
            }
        }

        return this.prisma.syncLog.create({ data: { organizationId: orgId, channelId, entityType, status: SyncStatus.IN_PROGRESS, startedAt: new Date() } });
    }

    private async completeSyncLog(logId: string, processed: number, failed: number) {
        await this.prisma.syncLog.update({ where: { id: logId }, data: { status: SyncStatus.COMPLETED, recordsProcessed: processed, recordsFailed: failed, cursor: null, completedAt: new Date() } });
    }

    private async failSyncLog(logId: string, processed: number, failed: number, error: unknown) {
        await this.prisma.syncLog.update({ where: { id: logId }, data: { status: SyncStatus.FAILED, recordsProcessed: processed, recordsFailed: failed, errorMessage: error instanceof Error ? error.message : String(error), completedAt: new Date() } });
    }

    // ─── ENUM MAPPERS ───
    private mapProductStatus(s: string): ProductStatus { return ({ active: 'ACTIVE', draft: 'DRAFT', archived: 'ARCHIVED' } as any)[s] || 'ACTIVE'; }
    private mapFinancialStatus(s: string): OrderFinancialStatus { return ({ pending: 'PENDING', authorized: 'AUTHORIZED', partially_paid: 'PARTIALLY_PAID', paid: 'PAID', partially_refunded: 'PARTIALLY_REFUNDED', refunded: 'REFUNDED', voided: 'VOIDED' } as any)[s] || 'PENDING'; }
    private mapFulfillmentStatus(s: string | null): OrderFulfillmentStatus { if (!s) return 'UNFULFILLED'; return ({ fulfilled: 'FULFILLED', partial: 'PARTIAL', restocked: 'RESTOCKED' } as any)[s] || 'UNFULFILLED'; }
    private mapCancelReason(s: string | null): OrderCancelReason | null { if (!s) return null; return ({ customer: 'CUSTOMER', fraud: 'FRAUD', inventory: 'INVENTORY', declined: 'DECLINED', other: 'OTHER' } as any)[s] || 'OTHER'; }
    private mapCustomerState(s: string): CustomerState { return ({ enabled: 'ENABLED', disabled: 'DISABLED', declined: 'DECLINED', invited: 'INVITED' } as any)[s] || 'ENABLED'; }

}