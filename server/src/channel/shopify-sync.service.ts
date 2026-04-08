import { Injectable, Logger } from '@nestjs/common';
import {
    ChannelStatus,
    SyncStatus,
    ProductStatus,
    OrderFinancialStatus,
    OrderFulfillmentStatus,
    OrderCancelReason,
    CustomerState,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyOAuthService } from './shopify-oauth.service';

const API_VERSION = '2024-01';
const PAGE_LIMIT = 250;

@Injectable()
export class ShopifySyncService {
    private readonly logger = new Logger(ShopifySyncService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly shopifyOAuth: ShopifyOAuthService,
    ) { }

    async runSync(channelId: string, orgId: string, entityTypes: string[]): Promise<void> {
        const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
        if (!channel) throw new Error(`Channel ${channelId} not found`);

        // Mark as syncing
        await this.prisma.channel.update({
            where: { id: channelId },
            data: { syncStatus: SyncStatus.IN_PROGRESS, status: ChannelStatus.SYNCING },
        });

        const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(channelId);
        let allSucceeded = true;

        try {
            for (const entityType of entityTypes) {
                try {
                    switch (entityType) {
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
                    this.logger.error(`Sync failed for ${entityType} on channel ${channelId}`, error);
                }
            }
        } finally {
            await this.prisma.channel.update({
                where: { id: channelId },
                data: {
                    syncStatus: allSucceeded ? SyncStatus.COMPLETED : SyncStatus.FAILED,
                    status: allSucceeded ? ChannelStatus.CONNECTED : ChannelStatus.ERROR,
                    lastSyncedAt: allSucceeded ? new Date() : undefined,
                },
            });
        }

        if (!allSucceeded) throw new Error('One or more entity syncs failed');
    }

    // ─── SYNC PRODUCTS ───
    private async syncProducts(channelId: string, orgId: string, shopDomain: string, token: string) {
        const syncLog = await this.createSyncLog(channelId, orgId, 'products');
        let processed = 0;
        let failed = 0;

        try {
            const countRes = await this.shopifyFetch(shopDomain, token, '/products/count.json');
            await this.prisma.syncLog.update({ where: { id: syncLog.id }, data: { totalEstimated: countRes?.count ?? 0 } });

            for await (const page of this.paginatedFetch(shopDomain, token, '/products.json', 'products', syncLog.cursor)) {
                for (const sp of page.data) {
                    try {
                        await this.upsertProduct(channelId, orgId, sp);
                        processed++;
                    } catch (error) {
                        failed++;
                        this.logger.error(`Failed product ${sp.id}`, error);
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

    // ─── SYNC ORDERS ───
    private async syncOrders(channelId: string, orgId: string, shopDomain: string, token: string) {
        const syncLog = await this.createSyncLog(channelId, orgId, 'orders');
        let processed = 0;
        let failed = 0;

        try {
            const countRes = await this.shopifyFetch(shopDomain, token, '/orders/count.json?status=any');
            await this.prisma.syncLog.update({ where: { id: syncLog.id }, data: { totalEstimated: countRes?.count ?? 0 } });

            const params: Record<string, string> = { status: 'any' };
            const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
            if (channel?.lastSyncedAt) {
                params['updated_at_min'] = channel.lastSyncedAt.toISOString();
            }

            for await (const page of this.paginatedFetch(shopDomain, token, '/orders.json', 'orders', syncLog.cursor, params)) {
                for (const so of page.data) {
                    try {
                        await this.upsertOrder(channelId, orgId, so);
                        processed++;
                    } catch (error) {
                        failed++;
                        this.logger.error(`Failed order ${so.id}`, error);
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

    // ─── SYNC CUSTOMERS ───
    private async syncCustomers(channelId: string, orgId: string, shopDomain: string, token: string) {
        const syncLog = await this.createSyncLog(channelId, orgId, 'customers');
        let processed = 0;
        let failed = 0;

        try {
            const countRes = await this.shopifyFetch(shopDomain, token, '/customers/count.json');
            await this.prisma.syncLog.update({ where: { id: syncLog.id }, data: { totalEstimated: countRes?.count ?? 0 } });

            for await (const page of this.paginatedFetch(shopDomain, token, '/customers.json', 'customers', syncLog.cursor)) {
                for (const sc of page.data) {
                    try {
                        await this.upsertCustomer(channelId, orgId, sc);
                        processed++;
                    } catch (error) {
                        failed++;
                        this.logger.error(`Failed customer ${sc.id}`, error);
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

    // ─── SYNC INVENTORY ───
    private async syncInventory(channelId: string, orgId: string, shopDomain: string, token: string) {
        const syncLog = await this.createSyncLog(channelId, orgId, 'inventory');
        let processed = 0;
        let failed = 0;

        try {
            for await (const page of this.paginatedFetch(shopDomain, token, '/products.json', 'products', syncLog.cursor, { fields: 'id,variants' })) {
                for (const product of page.data) {
                    for (const variant of product.variants || []) {
                        try {
                            const existing = await this.prisma.productVariant.findFirst({
                                where: { externalId: String(variant.id), product: { channelId } },
                            });
                            if (existing && existing.inventoryQuantity !== variant.inventory_quantity) {
                                await this.prisma.$transaction([
                                    this.prisma.productVariant.update({
                                        where: { id: existing.id },
                                        data: { inventoryQuantity: variant.inventory_quantity },
                                    }),
                                    this.prisma.inventoryEvent.create({
                                        data: {
                                            organizationId: orgId, variantId: existing.id,
                                            quantityBefore: existing.inventoryQuantity,
                                            quantityAfter: variant.inventory_quantity,
                                            changeAmount: variant.inventory_quantity - existing.inventoryQuantity,
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

    // ─── SYNC COLLECTIONS ───
    private async syncCollections(channelId: string, orgId: string, shopDomain: string, token: string) {
        const syncLog = await this.createSyncLog(channelId, orgId, 'collections');
        let processed = 0;
        let failed = 0;

        try {
            // 1. Sync custom collections
            for await (const page of this.paginatedFetch(shopDomain, token, '/custom_collections.json', 'custom_collections', syncLog.cursor)) {
                for (const col of page.data) {
                    try {
                        await this.upsertCollection(channelId, orgId, col, 'custom');
                        processed++;
                    } catch (error) {
                        failed++;
                        this.logger.error(`Failed custom collection ${col.id}`, error);
                    }
                }
            }

            // 2. Sync smart collections
            for await (const page of this.paginatedFetch(shopDomain, token, '/smart_collections.json', 'smart_collections', null)) {
                for (const col of page.data) {
                    try {
                        await this.upsertCollection(channelId, orgId, col, 'smart');
                        processed++;
                    } catch (error) {
                        failed++;
                        this.logger.error(`Failed smart collection ${col.id}`, error);
                    }
                }
            }

            // 3. Sync collects (product-collection links)
            for await (const page of this.paginatedFetch(shopDomain, token, '/collects.json', 'collects', null)) {
                for (const collect of page.data) {
                    try {
                        const product = await this.prisma.product.findFirst({
                            where: { channelId, externalId: String(collect.product_id) },
                        });
                        const collection = await this.prisma.collection.findFirst({
                            where: { channelId, externalId: String(collect.collection_id) },
                        });
                        if (product && collection) {
                            await this.prisma.productCollection.upsert({
                                where: { productId_collectionId: { productId: product.id, collectionId: collection.id } },
                                create: { productId: product.id, collectionId: collection.id, position: collect.position ?? 0 },
                                update: { position: collect.position ?? 0 },
                            });
                        }
                    } catch (error) {
                        this.logger.error(`Failed collect ${collect.id}`, error);
                    }
                }
            }

            await this.completeSyncLog(syncLog.id, processed, failed);
        } catch (error) {
            await this.failSyncLog(syncLog.id, processed, failed, error);
            throw error;
        }
    }

    // ─── UPSERT HELPERS ───

    private async upsertProduct(channelId: string, orgId: string, sp: any) {
        const externalId = String(sp.id);
        const tags = sp.tags ? sp.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];

        const product = await this.prisma.product.upsert({
            where: { channelId_externalId: { channelId, externalId } },
            create: {
                organizationId: orgId, channelId, externalId,
                title: sp.title, bodyHtml: sp.body_html, vendor: sp.vendor,
                productType: sp.product_type, status: this.mapProductStatus(sp.status),
                tags, options: sp.options || null,
                publishedAt: sp.published_at ? new Date(sp.published_at) : null,
                externalCreatedAt: sp.created_at ? new Date(sp.created_at) : null,
                externalUpdatedAt: sp.updated_at ? new Date(sp.updated_at) : null,
            },
            update: {
                title: sp.title, bodyHtml: sp.body_html, vendor: sp.vendor,
                productType: sp.product_type, status: this.mapProductStatus(sp.status),
                tags, options: sp.options || null,
                publishedAt: sp.published_at ? new Date(sp.published_at) : null,
                externalUpdatedAt: sp.updated_at ? new Date(sp.updated_at) : null,
            },
        });

        for (const sv of sp.variants || []) {
            await this.prisma.productVariant.upsert({
                where: { productId_externalId: { productId: product.id, externalId: String(sv.id) } },
                create: {
                    productId: product.id, externalId: String(sv.id), title: sv.title || 'Default',
                    sku: sv.sku, barcode: sv.barcode, price: sv.price,
                    compareAtPrice: sv.compare_at_price, inventoryQuantity: sv.inventory_quantity ?? 0,
                    weight: sv.weight ? String(sv.weight) : null, weightUnit: sv.weight_unit,
                    option1: sv.option1, option2: sv.option2, option3: sv.option3,
                    position: sv.position ?? 1, requiresShipping: sv.requires_shipping ?? true,
                    taxable: sv.taxable ?? true,
                },
                update: {
                    title: sv.title || 'Default', sku: sv.sku, barcode: sv.barcode,
                    price: sv.price, compareAtPrice: sv.compare_at_price,
                    inventoryQuantity: sv.inventory_quantity ?? 0,
                    weight: sv.weight ? String(sv.weight) : null, weightUnit: sv.weight_unit,
                    option1: sv.option1, option2: sv.option2, option3: sv.option3, position: sv.position ?? 1,
                },
            });
        }

        for (const si of sp.images || []) {
            await this.prisma.productImage.upsert({
                where: { productId_externalId: { productId: product.id, externalId: String(si.id) } },
                create: { productId: product.id, externalId: String(si.id), src: si.src, alt: si.alt, position: si.position ?? 1 },
                update: { src: si.src, alt: si.alt, position: si.position ?? 1 },
            });
        }
    }

    private async upsertOrder(channelId: string, orgId: string, so: any) {
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
                    const existing = await this.prisma.customer.findFirst({ where: { channelId, externalId: String(so.customer.id) } });
                    customerId = existing?.id ?? null;
                }
            }
        }

        const tags = so.tags ? so.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
        const shippingPrice = so.total_shipping_price_set?.shop_money?.amount ?? so.total_shipping_price ?? '0';

        const order = await this.prisma.order.upsert({
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
                externalUpdatedAt: so.updated_at ? new Date(so.updated_at) : null,
            },
            update: {
                customerId,
                financialStatus: this.mapFinancialStatus(so.financial_status),
                fulfillmentStatus: this.mapFulfillmentStatus(so.fulfillment_status),
                totalPrice: so.total_price || '0', totalTax: so.total_tax || '0',
                totalDiscounts: so.total_discounts || '0', totalShippingPrice: shippingPrice,
                shippingAddress: so.shipping_address || null, billingAddress: so.billing_address || null,
                note: so.note, tags,
                cancelReason: this.mapCancelReason(so.cancel_reason),
                cancelledAt: so.cancelled_at ? new Date(so.cancelled_at) : null,
                closedAt: so.closed_at ? new Date(so.closed_at) : null,
                externalUpdatedAt: so.updated_at ? new Date(so.updated_at) : null,
            },
        });

        for (const li of so.line_items || []) {
            let variantId: string | null = null;
            if (li.variant_id) {
                const variant = await this.prisma.productVariant.findFirst({ where: { externalId: String(li.variant_id), product: { channelId } } });
                variantId = variant?.id ?? null;
            }
            await this.prisma.orderLineItem.upsert({
                where: { orderId_externalId: { orderId: order.id, externalId: String(li.id) } },
                create: {
                    orderId: order.id, variantId, externalId: String(li.id),
                    externalProductId: li.product_id ? String(li.product_id) : null,
                    externalVariantId: li.variant_id ? String(li.variant_id) : null,
                    title: li.title || 'Unknown', variantTitle: li.variant_title, sku: li.sku,
                    quantity: li.quantity, price: li.price || '0', totalDiscount: li.total_discount || '0',
                    fulfillmentStatus: li.fulfillment_status, requiresShipping: li.requires_shipping ?? true,
                    taxable: li.taxable ?? true, properties: li.properties || null,
                },
                update: { variantId, title: li.title || 'Unknown', quantity: li.quantity, price: li.price || '0', totalDiscount: li.total_discount || '0', fulfillmentStatus: li.fulfillment_status },
            });
        }

        for (const ff of so.fulfillments || []) {
            await this.prisma.orderFulfillment.upsert({
                where: { orderId_externalId: { orderId: order.id, externalId: String(ff.id) } },
                create: { orderId: order.id, externalId: String(ff.id), status: ff.status || 'pending', trackingNumber: ff.tracking_number, trackingUrl: ff.tracking_url, trackingCompany: ff.tracking_company, shippedAt: ff.created_at ? new Date(ff.created_at) : null },
                update: { status: ff.status || 'pending', trackingNumber: ff.tracking_number, trackingUrl: ff.tracking_url, trackingCompany: ff.tracking_company },
            });
        }

        for (const rf of so.refunds || []) {
            const refundAmount = rf.transactions?.[0]?.amount || '0';
            await this.prisma.orderRefund.upsert({
                where: { orderId_externalId: { orderId: order.id, externalId: String(rf.id) } },
                create: { orderId: order.id, externalId: String(rf.id), amount: refundAmount, currency: so.currency || 'USD', reason: rf.note, note: rf.note, lineItems: rf.refund_line_items || null, processedAt: rf.processed_at ? new Date(rf.processed_at) : null },
                update: { amount: refundAmount, note: rf.note, lineItems: rf.refund_line_items || null },
            });
        }
    }

    private async upsertCustomer(channelId: string, orgId: string, sc: any) {
        const externalId = String(sc.id);
        const tags = sc.tags ? sc.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];

        await this.prisma.customer.upsert({
            where: { channelId_externalId: { channelId, externalId } },
            create: {
                organizationId: orgId, channelId, externalId,
                email: sc.email, firstName: sc.first_name, lastName: sc.last_name, phone: sc.phone,
                state: this.mapCustomerState(sc.state), verifiedEmail: sc.verified_email ?? false,
                acceptsMarketing: sc.accepts_marketing ?? false, ordersCount: sc.orders_count ?? 0,
                totalSpent: sc.total_spent || '0', tags, note: sc.note,
                addresses: sc.addresses || null, defaultAddress: sc.default_address || null,
                externalCreatedAt: sc.created_at ? new Date(sc.created_at) : null,
                externalUpdatedAt: sc.updated_at ? new Date(sc.updated_at) : null,
            },
            update: {
                email: sc.email, firstName: sc.first_name, lastName: sc.last_name, phone: sc.phone,
                state: this.mapCustomerState(sc.state), verifiedEmail: sc.verified_email ?? false,
                acceptsMarketing: sc.accepts_marketing ?? false, ordersCount: sc.orders_count ?? 0,
                totalSpent: sc.total_spent || '0', tags, note: sc.note,
                addresses: sc.addresses || null, defaultAddress: sc.default_address || null,
                externalUpdatedAt: sc.updated_at ? new Date(sc.updated_at) : null,
                // NOTE: vipLevel, internalNotes, segments are NOT overwritten (CRM-only fields)
            },
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

    // ─── PAGINATED FETCH ───
    private async *paginatedFetch(
        shopDomain: string, token: string, endpoint: string,
        resourceKey: string, startCursor?: string | null,
        extraParams?: Record<string, string>,
    ): AsyncGenerator<{ data: any[]; nextCursor: string | null }> {
        let url: string;
        if (startCursor) {
            url = `https://${shopDomain}/admin/api/${API_VERSION}${endpoint}?limit=${PAGE_LIMIT}&page_info=${startCursor}`;
        } else {
            const params = new URLSearchParams({ limit: String(PAGE_LIMIT), ...extraParams });
            url = `https://${shopDomain}/admin/api/${API_VERSION}${endpoint}?${params.toString()}`;
        }

        while (url) {
            const res = await this.fetchWithRateLimit(url, token);
            const data = await res.json();
            const items = data[resourceKey] || [];
            const linkHeader = res.headers.get('link');
            const nextCursor = this.parseNextCursor(linkHeader);

            yield { data: items, nextCursor };

            url = nextCursor
                ? `https://${shopDomain}/admin/api/${API_VERSION}${endpoint}?limit=${PAGE_LIMIT}&page_info=${nextCursor}`
                : '';
        }
    }

    private async fetchWithRateLimit(url: string, token: string): Promise<Response> {
        while (true) {
            const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get('Retry-After') || '2', 10);
                this.logger.warn(`Rate limited, waiting ${retryAfter}s`);
                await this.sleep(retryAfter * 1000);
                continue;
            }
            if (res.status === 403) {
                const errorBody = await res.text();
                this.logger.warn(`Shopify 403 Forbidden: ${errorBody}. Enable "Protected customer data access" in your Shopify Partner Dashboard → App → API access.`);
                throw new Error(`Shopify access denied (403). Your app needs "Protected customer data access" enabled in the Shopify Partner Dashboard. Details: ${errorBody}`);
            }
            if (!res.ok) throw new Error(`Shopify API ${res.status}: ${await res.text()}`);
            const callLimit = res.headers.get('X-Shopify-Shop-Api-Call-Limit');
            if (callLimit) {
                const [used, max] = callLimit.split('/').map(Number);
                if (used / max > 0.8) await this.sleep(500);
            }
            return res;
        }
    }

    private async shopifyFetch(shopDomain: string, token: string, endpoint: string): Promise<any> {
        const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}${endpoint}`, { headers: { 'X-Shopify-Access-Token': token } });
        return res.ok ? res.json() : null;
    }

    // ─── SYNC LOG HELPERS ───
    private async createSyncLog(channelId: string, orgId: string, entityType: string) {
        const existing = await this.prisma.syncLog.findFirst({
            where: { channelId, entityType, status: SyncStatus.IN_PROGRESS },
            orderBy: { createdAt: 'desc' },
        });
        if (existing) return existing;
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

    private parseNextCursor(link: string | null): string | null {
        if (!link) return null;
        const match = link.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
        return match ? match[1] : null;
    }

    private sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
}