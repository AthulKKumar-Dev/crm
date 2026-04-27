import {
    Controller,
    Headers,
    HttpCode,
    Logger,
    Post,
    Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../../auth/decorators/public.decorator';
import { BillingService } from '../billing.service';
import { RazorpayService } from '../razorpay.service';

/**
 * Razorpay webhook endpoint. Mirrors the existing Shopify webhook pattern:
 * - `@Public()` so JwtAuthGuard doesn't reject the unauthenticated request
 * - Raw body via `RawBodyRequest` (enabled in main.ts via `rawBody: true`)
 * - HMAC-SHA256 verification with constant-time compare
 * - Always returns 200 once verified (Razorpay retries on non-2xx)
 */
@Controller('webhooks')
export class RazorpayWebhookController {
    private readonly logger = new Logger(RazorpayWebhookController.name);

    constructor(
        private readonly razorpay: RazorpayService,
        private readonly billing: BillingService,
    ) { }

    @Public()
    @Post('razorpay')
    @HttpCode(200)
    async handleWebhook(
        @Req() req: RawBodyRequest<Request>,
        @Headers('x-razorpay-signature') signature: string,
    ) {
        const rawBody = req.rawBody;

        if (!rawBody || !signature) {
            this.logger.warn('Razorpay webhook missing body or signature');
            return { received: false };
        }

        if (!this.razorpay.verifyWebhookSignature(rawBody, signature)) {
            this.logger.warn('Razorpay webhook bad signature');
            return { received: false };
        }

        const body = JSON.parse(rawBody.toString()) as {
            event: string;
            payload: unknown;
        };

        try {
            await this.billing.handleWebhookEvent(
                body.event,
                body.payload as Parameters<BillingService['handleWebhookEvent']>[1],
            );
        } catch (err) {
            this.logger.error(`Webhook ${body.event} processing failed`, err);
            // Still return 200 — idempotent retry would re-fail anyway.
            // Logged + alertable in monitoring.
        }

        return { received: true };
    }
}
