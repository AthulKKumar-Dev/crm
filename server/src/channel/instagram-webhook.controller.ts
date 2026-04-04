import { Controller, Post, Get, Req, Query, Res, Headers, HttpCode, Logger } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('webhooks')
export class InstagramWebhookController {
    private readonly logger = new Logger(InstagramWebhookController.name);
    private readonly appSecret: string;
    private readonly verifyToken: string;

    constructor(
        private readonly config: ConfigService,
        private readonly prisma: PrismaService,
    ) {
        this.appSecret = this.config.get<string>('instagram.appSecret')!;
        this.verifyToken = this.config.get<string>('instagram.webhookVerifyToken')!;
    }

    // GET /webhooks/instagram — Meta webhook verification (challenge-response)
    @Public()
    @Get('instagram')
    verifyWebhook(
        @Query('hub.mode') mode: string,
        @Query('hub.verify_token') token: string,
        @Query('hub.challenge') challenge: string,
        @Res() res: Response,
    ) {
        if (mode === 'subscribe' && token === this.verifyToken) {
            this.logger.log('Instagram webhook verified');
            return res.status(200).send(challenge);
        }
        this.logger.warn('Instagram webhook verification failed');
        return res.status(403).send('Forbidden');
    }

    // POST /webhooks/instagram — Receive Instagram events
    @Public()
    @Post('instagram')
    @HttpCode(200)
    async handleWebhook(
        @Req() req: RawBodyRequest<Request>,
        @Headers('x-hub-signature-256') signature: string,
    ) {
        const rawBody = req.rawBody;
        if (!rawBody || !signature) {
            this.logger.warn('Instagram webhook missing body or signature');
            return { received: false };
        }

        // Verify signature: x-hub-signature-256: sha256=<hex_hash>
        const expectedSignature = 'sha256=' + createHmac('sha256', this.appSecret)
            .update(rawBody)
            .digest('hex');

        const sigBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);

        if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
            this.logger.warn('Instagram webhook invalid signature');
            return { received: false };
        }

        // Parse the event
        const body = JSON.parse(rawBody.toString()) as {
            object: string;
            entry: Array<{
                id: string;
                time: number;
                messaging?: Array<{
                    sender: { id: string };
                    recipient: { id: string };
                    timestamp: number;
                    message?: { mid: string; text: string };
                }>;
                changes?: Array<{
                    field: string;
                    value: Record<string, unknown>;
                }>;
            }>;
        };

        this.logger.log(`Instagram webhook: ${body.object}, entries: ${body.entry?.length}`);

        // Process each entry
        for (const entry of body.entry || []) {
            // Handle DMs
            if (entry.messaging) {
                for (const msg of entry.messaging) {
                    this.logger.log(`Instagram DM from ${msg.sender.id}: ${msg.message?.text}`);
                    // TODO: Create conversation/message in unified inbox when Conversations module is built
                }
            }

            // Handle comments, mentions
            if (entry.changes) {
                for (const change of entry.changes) {
                    this.logger.log(`Instagram ${change.field}: ${JSON.stringify(change.value)}`);
                    // TODO: Process comments/mentions when Conversations module is built
                }
            }
        }

        return { received: true };
    }
}