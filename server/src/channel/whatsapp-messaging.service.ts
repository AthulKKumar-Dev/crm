import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import type { WhatsAppMessageJobData } from './whatsapp.queue';

/**
 * Meta error codes that should NOT be retried (job should fail permanently).
 * Source: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/
 */
const NON_RETRYABLE_ERROR_CODES = new Set<number>([
    190, // OAuthException — token expired / revoked
    132, // Template does not exist or is not approved
    131009, // Parameter value invalid (bad phone format)
    131026, // Message undeliverable (recipient not on WhatsApp)
    131047, // Re-engagement required (24-hour window expired and no approved template)
    131051, // Unsupported message type
]);

interface WhatsAppChannelCredentials {
    wabaId: string;
    phoneNumberId: string;
    accessToken: string; // encrypted
    [key: string]: unknown;
}

interface MetaSendResponse {
    messaging_product: string;
    contacts?: Array<{ input: string; wa_id: string }>;
    messages?: Array<{ id: string; message_status?: string }>;
}

interface MetaErrorResponse {
    error: {
        message: string;
        type?: string;
        code: number;
        error_subcode?: number;
        error_data?: { details?: string };
        fbtrace_id?: string;
    };
}

/**
 * Sends template messages to customers via Meta's WhatsApp Cloud API.
 *
 * Responsibilities:
 *   • Decrypt the merchant's access token from Channel.credentials
 *   • Insert a WhatsAppMessageLog row with status=queued BEFORE the API call
 *     (so every attempt is auditable even if the process crashes mid-request)
 *   • POST to graph.facebook.com/.../{phoneNumberId}/messages
 *   • Update the log row with status=sent (+ externalId) or status=failed
 *   • Re-throw for retry-worthy errors so BullMQ can retry with backoff.
 */
@Injectable()
export class WhatsAppMessagingService {
    private readonly logger = new Logger(WhatsAppMessagingService.name);
    private readonly graphVersion: string;

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly encryption: EncryptionService,
    ) {
        this.graphVersion = this.config.get<string>('whatsapp.graphVersion') ?? 'v21.0';
    }

    async sendTemplate(data: WhatsAppMessageJobData): Promise<void> {
        const channel = await this.prisma.channel.findUnique({ where: { id: data.channelId } });
        if (!channel || !channel.credentials) {
            throw new Error(`WhatsApp channel ${data.channelId} not found or missing credentials`);
        }
        const creds = channel.credentials as unknown as WhatsAppChannelCredentials;
        const accessToken = this.encryption.decrypt(creds.accessToken);
        const phoneNumberId = creds.phoneNumberId;

        const requestBody = {
            messaging_product: 'whatsapp',
            to: data.toPhone,
            type: 'template',
            template: {
                name: data.templateName,
                language: { code: data.templateLanguage },
            },
        };

        // Insert an audit row BEFORE the API call. If the process dies mid-request,
        // we still have a record of the attempt.
        const log = await this.prisma.whatsAppMessageLog.create({
            data: {
                organizationId: data.organizationId,
                channelId: data.channelId,
                customerId: data.customerId ?? null,
                orderId: data.orderId ?? null,
                templateName: data.templateName,
                templateLanguage: data.templateLanguage,
                triggerType: data.triggerType,
                toPhone: data.toPhone,
                status: 'queued',
                requestPayload: requestBody,
            },
        });

        const url = `https://graph.facebook.com/${this.graphVersion}/${phoneNumberId}/messages`;
        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
        } catch (networkErr) {
            // Network error → mark as failed, then re-throw so BullMQ retries.
            await this.prisma.whatsAppMessageLog.update({
                where: { id: log.id },
                data: {
                    status: 'failed',
                    errorMessage: (networkErr as Error).message,
                    failedAt: new Date(),
                },
            });
            throw networkErr;
        }

        const responseBody = (await response.json().catch(() => ({}))) as
            | MetaSendResponse
            | MetaErrorResponse;

        if (response.ok && 'messages' in responseBody && responseBody.messages?.[0]?.id) {
            const externalId = responseBody.messages[0].id;
            await this.prisma.whatsAppMessageLog.update({
                where: { id: log.id },
                data: {
                    status: 'sent',
                    externalId,
                    responsePayload: responseBody as object,
                    sentAt: new Date(),
                },
            });
            this.logger.log(
                `WhatsApp ${data.templateName} sent to ${data.toPhone} (wamid=${externalId})`,
            );
            return;
        }

        // Non-2xx path — parse Meta's error.
        const error = (responseBody as MetaErrorResponse).error;
        const code = error?.code ?? response.status;
        const message = error?.message ?? `HTTP ${response.status}`;

        await this.prisma.whatsAppMessageLog.update({
            where: { id: log.id },
            data: {
                status: 'failed',
                errorCode: String(code),
                errorMessage: message,
                responsePayload: responseBody as object,
                failedAt: new Date(),
            },
        });

        // Special handling: auth errors mean the merchant's token is dead — mark
        // channel as ERROR so the UI surfaces that they need to reconnect.
        if (code === 190) {
            await this.prisma.channel.update({
                where: { id: data.channelId },
                data: { status: ChannelStatus.ERROR },
            });
            this.logger.warn(
                `WhatsApp channel ${data.channelId} token expired/revoked; marked ERROR`,
            );
        }

        this.logger.error(
            `WhatsApp send failed (code=${code}): ${message} for ${data.toPhone}`,
        );

        // Re-throw only for retry-worthy errors. Non-retryable errors have already
        // been logged as `failed`; throwing would just burn retries on a guaranteed failure.
        if (NON_RETRYABLE_ERROR_CODES.has(Number(code))) return;

        throw new Error(`WhatsApp send failed (code=${code}): ${message}`);
    }
}
