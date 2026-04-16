import { Controller, Post, Req, Headers, HttpCode, Logger } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { ChannelPlatform } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import { ShopifySyncService } from './shopify-sync.service';

@Controller('webhooks')
export class ShopifyWebhookController {
    private readonly logger = new Logger(ShopifyWebhookController.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly encryption: EncryptionService,
        private readonly syncService: ShopifySyncService,
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
                    await this.syncService.upsertOrder(
                        channel.id,
                        channel.organizationId,
                        body,
                    );
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