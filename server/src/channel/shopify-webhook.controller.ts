import { Controller, Post, Req, Headers, HttpCode } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '@nestjs/common';

@Controller('webhooks')
export class ShopifyWebhookController {
    private readonly logger = new Logger(ShopifyWebhookController.name);
    private readonly webhookSecret: string;

    constructor(
        private readonly config: ConfigService,
        private readonly prisma: PrismaService,
    ) {
        this.webhookSecret = this.config.get<string>('shopify.webhookSecret')!;
    }

    @Public()
    @Post('shopify')
    @HttpCode(200)
    async handleWebhook(
        @Req() req: RawBodyRequest<Request>,
        @Headers('x-shopify-hmac-sha256') hmac: string,
        @Headers('x-shopify-topic') topic: string,
        @Headers('x-shopify-shop-domain') shopDomain: string,
    ) {
        // 1. Verify webhook signature
        const rawBody = req.rawBody;
        if (!rawBody || !hmac) {
            this.logger.warn('Webhook missing body or HMAC');
            return { received: false };
        }

        const generatedHmac = createHmac('sha256', this.webhookSecret)
            .update(rawBody)
            .digest('base64');

        const hmacBuffer = Buffer.from(hmac, 'base64');
        const generatedBuffer = Buffer.from(generatedHmac, 'base64');

        if (hmacBuffer.length !== generatedBuffer.length || !timingSafeEqual(hmacBuffer, generatedBuffer)) {
            this.logger.warn(`Invalid webhook HMAC from ${shopDomain}`);
            return { received: false };
        }

        // 2. Find the channel by shop domain
        const body: unknown = JSON.parse(rawBody.toString());
        this.logger.log(`Webhook received: ${topic} from ${shopDomain}`);

        // 3. Process based on topic
        // TODO: Implement handlers for each topic
        // switch (topic) {
        //   case 'orders/create': break;
        //   case 'orders/updated': break;
        //   case 'products/create': break;
        //   case 'products/update': break;
        //   case 'customers/create': break;
        //   case 'customers/update': break;
        //   case 'inventory_levels/update': break;
        // }

        return { received: true };
    }
}