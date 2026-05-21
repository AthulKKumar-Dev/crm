import { Controller, Post, Req, Headers, HttpCode, Logger } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { ChannelPlatform } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import { ShopifySyncService } from './shopify-sync.service';
import { WhatsAppTriggerService } from './whatsapp-trigger.service';

@Controller('webhooks')
export class ShopifyWebhookController {
    private readonly logger = new Logger(ShopifyWebhookController.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly encryption: EncryptionService,
        private readonly syncService: ShopifySyncService,
        private readonly whatsappTrigger: WhatsAppTriggerService,
    ) { }

    @Public()
    @Post('shopify')
    @HttpCode(200)
    async handleWebhook(
        @Req() req: RawBodyRequest<Request>,
        @Headers('x-shopify-hmac-sha256') hmac: string,
        @Headers('x-shopify-topic') topic: string,
        @Headers('x-shopify-shop-domain') shopDomain: string,
    ) {
        const rawBody = req.rawBody;
        if (!rawBody || !hmac) {
            this.logger.warn('Webhook missing body or HMAC');
            return { received: false };
        }

        // 1. Find the channel by shop domain to get its API secret
        const channel = await this.prisma.channel.findFirst({
            where: {
                platform: ChannelPlatform.SHOPIFY,
                externalStoreUrl: `https://${shopDomain}`,
            },
        });

        if (!channel || !channel.credentials) {
            this.logger.warn(`No channel found for shop domain: ${shopDomain}`);
            return { received: false };
        }

        // 2. Verify HMAC using the channel's own API secret
        const creds = channel.credentials as { apiSecret: string };
        const apiSecret = this.encryption.decrypt(creds.apiSecret);

        const generatedHmac = createHmac('sha256', apiSecret)
            .update(rawBody)
            .digest('base64');

        const hmacBuffer = Buffer.from(hmac, 'base64');
        const generatedBuffer = Buffer.from(generatedHmac, 'base64');

        if (
            hmacBuffer.length !== generatedBuffer.length ||
            !timingSafeEqual(hmacBuffer, generatedBuffer)
        ) {
            this.logger.warn(`Invalid webhook HMAC from ${shopDomain}`);
            return { received: false };
        }

        // 3. Parse body and process by topic
        const body = JSON.parse(rawBody.toString());
        this.logger.log(`Webhook received: ${topic} from ${shopDomain}`);

        try {
            switch (topic) {
                case 'products/create':
                case 'products/update':
                    await this.syncService.upsertProduct(
                        channel.id,
                        channel.organizationId,
                        body,
                    );
                    break;

                case 'products/delete':
                    await this.handleProductDelete(channel.id, body);
                    break;

                case 'orders/create':
                case 'orders/updated':
                case 'orders/cancelled':
                case 'orders/fulfilled':
                case 'orders/partially_fulfilled':
                    // `upsertOrder` already reads `cancel_reason` / `cancelled_at`
                    // and the `fulfillments` array from the payload, so a
                    // cancellation/fulfillment webhook reconciles the local row
                    // by going through the same code path. Optimistic local
                    // updates from the service actions run before this webhook
                    // arrives — this is the authoritative reconcile.
                    await this.syncService.upsertOrder(
                        channel.id,
                        channel.organizationId,
                        body,
                    );
                    // Fire WhatsApp trigger only on NEW orders. Wrapped in
                    // try/catch so a messaging failure never bubbles up as a 5xx
                    // (which would make Shopify retry the whole webhook and
                    // potentially duplicate work).
                    if (topic === 'orders/create') {
                        try {
                            console.log('body whatsapp trigger', body);
                            await this.whatsappTrigger.onOrderPlaced(
                                channel.organizationId,
                                channel.id,
                                body,
                            );
                        } catch (err) {
                            this.logger.warn(
                                `WhatsApp trigger failed (non-fatal): ${err instanceof Error ? err.message : err}`,
                            );
                        }
                        // Also record the order as an analytics event so
                        // the cart aggregator can compute
                        // checkout→order conversion using consistent
                        // sources (webhook-only counts on both sides of
                        // the ratio). The local Order table still drives
                        // the overall revenue / conversionRate stats —
                        // this row is just for funnel math.
                        await this.recordAnalyticsEvent(
                            channel.id,
                            channel.organizationId,
                            topic,
                            body,
                        );
                    }
                    break;

                case 'customers/create':
                case 'customers/update':
                    await this.syncService.upsertCustomer(
                        channel.id,
                        channel.organizationId,
                        body,
                    );
                    break;

                case 'inventory_levels/update':
                    await this.handleInventoryUpdate(
                        channel.id,
                        channel.organizationId,
                        body,
                    );
                    break;

                case 'fulfillments/create':
                case 'fulfillments/update':
                    // Shopify also fires orders/fulfilled / orders/partially_fulfilled
                    // / orders/updated with the parent order (including the updated
                    // fulfillments array) for the same actions, and those flow
                    // through upsertOrder which is the authoritative reconcile.
                    // We subscribe to fulfillments/* topics for observability and
                    // future per-fulfillment fast paths.
                    this.logger.log(
                        `Fulfillment webhook ${topic}: fulfillment ${body?.id} on order ${body?.order_id}`,
                    );
                    break;

                case 'draft_orders/create':
                case 'draft_orders/update':
                    // Mirrors changes made on the Shopify side back into our
                    // DraftOrder row. Local optimistic updates (from our own
                    // service paths) usually arrive first; this is the
                    // authoritative reconcile if the merchant edited the draft
                    // in Shopify admin directly.
                    await this.syncService.upsertDraftOrder(
                        channel.id,
                        channel.organizationId,
                        body,
                    );
                    break;

                // ─── Analytics: cart + checkout events ─────────────────
                // Stored verbatim in `RawAnalyticsEvent`. The hourly
                // `CartEventsAggregator` dedupes by cart/checkout token and
                // rolls them into `AnalyticsSnapshot.metrics.byProduct`.
                // We don't process them inline — webhooks can fire dozens
                // of times for a single shopper session, so we want the
                // aggregator to dedupe instead of doing read-modify-write
                // on every event.
                case 'carts/create':
                case 'carts/update':
                case 'checkouts/create':
                case 'checkouts/update':
                case 'checkouts/delete':
                    await this.recordAnalyticsEvent(
                        channel.id,
                        channel.organizationId,
                        topic,
                        body,
                    );
                    break;

                default:
                    this.logger.log(`Unhandled webhook topic: ${topic}`);
            }
        } catch (error) {
            this.logger.error(
                `Failed to process webhook ${topic} from ${shopDomain}`,
                error instanceof Error ? error.stack : error,
            );
        }

        return { received: true };
    }

    private async handleProductDelete(channelId: string, body: { id: number }) {
        const externalId = String(body.id);
        const product = await this.prisma.product.findFirst({
            where: { channelId, externalId },
        });

        if (product) {
            await this.prisma.product.update({
                where: { id: product.id },
                data: { status: 'ARCHIVED' },
            });
            this.logger.log(`Product ${externalId} marked as archived (deleted in Shopify)`);
        }
    }

    /**
     * Persist a webhook payload as a `RawAnalyticsEvent` row. The
     * `sessionId` field carries the right token for each topic so the
     * aggregator can deduplicate / link funnel stages:
     *   - cart events     → cart `token`
     *   - checkout events → checkout `token` (falls back to `cart_token`
     *                       so a checkout can be matched back to its cart)
     *   - order events    → `checkout_token` (links the order to its
     *                       checkout for funnel math); falls back to
     *                       order id if checkout_token is absent.
     */
    private async recordAnalyticsEvent(
        channelId: string,
        orgId: string,
        topic: string,
        body: Record<string, unknown>,
    ) {
        const occurredAt = this.parseEventTimestamp(body) ?? new Date();
        const sessionId = this.extractSessionToken(topic, body);
        const externalCustomerId =
            ((body as { customer?: { id?: string | number } }).customer?.id ??
                null) === null
                ? null
                : String(
                      (body as { customer: { id: string | number } }).customer
                          .id,
                  );

        try {
            await this.prisma.rawAnalyticsEvent.create({
                data: {
                    organizationId: orgId,
                    channelId,
                    eventName: topic.replace('/', '_'),
                    occurredAt,
                    visitorId: null,
                    sessionId,
                    externalCustomerId,
                    payload: body as object,
                },
            });
        } catch (err) {
            this.logger.warn(
                `Failed to record analytics event for ${topic}: ${err instanceof Error ? err.message : err}`,
            );
        }
    }

    private extractSessionToken(
        topic: string,
        body: Record<string, unknown>,
    ): string | null {
        if (topic.startsWith('orders/')) {
            // Order webhooks don't have a plain `token` field; we prefer
            // `checkout_token` so the order rolls up under the same
            // funnel slot as its preceding checkout. Falls back to the
            // order id (always present) so the count of distinct orders
            // is never wrong.
            const checkoutToken = (body as { checkout_token?: string })
                .checkout_token;
            if (typeof checkoutToken === 'string') return checkoutToken;
            const id = (body as { id?: string | number }).id;
            return id ? String(id) : null;
        }
        // Cart + checkout webhooks both expose `token` directly.
        return (
            (body as { token?: string }).token ??
            (body as { cart_token?: string }).cart_token ??
            null
        );
    }

    private parseEventTimestamp(body: Record<string, unknown>): Date | null {
        const raw =
            (body as { updated_at?: string }).updated_at ??
            (body as { created_at?: string }).created_at;
        if (typeof raw !== 'string') return null;
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    private async handleInventoryUpdate(
        channelId: string,
        orgId: string,
        body: { inventory_item_id: number; available: number; location_id: number },
    ) {
        const variant = await this.prisma.productVariant.findFirst({
            where: {
                product: { channelId },
                inventoryItemId: String(body.inventory_item_id),
            },
        });

        if (!variant) return;

        const newQuantity = body.available;
        if (variant.inventoryQuantity === newQuantity) return;

        await this.prisma.$transaction([
            this.prisma.productVariant.update({
                where: { id: variant.id },
                data: { inventoryQuantity: newQuantity },
            }),
            this.prisma.inventoryEvent.create({
                data: {
                    organizationId: orgId,
                    variantId: variant.id,
                    quantityBefore: variant.inventoryQuantity,
                    quantityAfter: newQuantity,
                    changeAmount: newQuantity - variant.inventoryQuantity,
                    reason: 'webhook',
                    referenceType: 'webhook',
                },
            }),
        ]);

        this.logger.log(
            `Inventory updated via webhook: variant ${variant.id}, ${variant.inventoryQuantity} → ${newQuantity}`,
        );
    }
}