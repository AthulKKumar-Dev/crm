import { Injectable } from '@nestjs/common';
import {
    ChannelPlatform,
    MessageDirection,
    MessageKind,
    MessageStatus,
    Prisma,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ContactService } from './contact.service';

export interface RecordInboundInput {
    organizationId: string;
    channelId: string;
    platform: ChannelPlatform;
    contactId: string;
    /** Our own account id (the channel's external_store_id). */
    toAddress: string;
    /** The sender's IGSID. */
    fromAddress: string;
    /** Instagram message id (mid). Dedupe key with channelId. */
    externalId: string;
    text?: string;
    kind: MessageKind;
    /** The raw webhook messaging object. */
    body: unknown;
    occurredAt: Date;
}

const PREVIEW_LENGTH = 140;
const ERROR_MESSAGE_MAX = 1000;

/** UTC midnight for a @db.Date column. */
export function dayOf(at: Date): Date {
    return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

export interface CreateOutboundInput {
    organizationId: string;
    channelId: string;
    platform: ChannelPlatform;
    contactId: string;
    kind: MessageKind;
    /** Comment id for a private reply, IGSID for a DM. */
    toAddress: string;
    /** Our Instagram account id. */
    fromAddress: string;
    text: string;
    body: unknown;
    inReplyToExternalId?: string;
    idempotencyKey: string;
    automationId: string;
    automationRunId: string;
    stepKey: string;
}

export interface MarkFailedInput {
    code: string;
    message: string;
    response?: unknown;
    mute?: { afterFailures: number; hours: number }
}

/**
 * The letters: inbound rows only for now. Outbound (createOutbound / markSent /
 * markFailed) arrives with the send step.
 */
@Injectable()
export class MessageService {
    constructor(private readonly prisma: PrismaService, private readonly contacts: ContactService) { }

    /** The redelivery check for DMs; the partial unique index is the race fallback. */
    findInboundByExternalId(tx: Prisma.TransactionClient, channelId: string, externalId: string) {
        return tx.message.findFirst({
            where: { channelId, externalId, direction: MessageDirection.INBOUND },
            select: { id: true },
        });
    }

    async recordInbound(tx: Prisma.TransactionClient, input: RecordInboundInput) {
        const preview = (input.text ?? '').trim().slice(0, PREVIEW_LENGTH) || null;

        const conversation = await tx.conversation.upsert({
            where: {
                channelId_contactId: { channelId: input.channelId, contactId: input.contactId },
            },
            create: {
                organizationId: input.organizationId,
                channelId: input.channelId,
                contactId: input.contactId,
                platform: input.platform,
                lastMessageAt: input.occurredAt,
                lastInboundAt: input.occurredAt,
                lastMessagePreview: preview,
                unreadCount: 1,
                messageCount: 1,
            },
            update: {
                lastMessageAt: input.occurredAt,
                lastInboundAt: input.occurredAt,
                lastMessagePreview: preview,
                unreadCount: { increment: 1 },
                messageCount: { increment: 1 },
            },
        });

        const message = await tx.message.create({
            data: {
                organizationId: input.organizationId,
                channelId: input.channelId,
                platform: input.platform,
                direction: MessageDirection.INBOUND,
                kind: input.kind,
                conversationId: conversation.id,
                contactId: input.contactId,
                toAddress: input.toAddress,
                fromAddress: input.fromAddress,
                text: input.text ?? null,
                body: input.body as Prisma.InputJsonValue,
                status: MessageStatus.DELIVERED,
                externalId: input.externalId,
                deliveredAt: input.occurredAt,
            },
        });

        const date = dayOf(input.occurredAt);
        await tx.contactDailyStat.upsert({
            where: { contactId_date: { contactId: input.contactId, date } },
            create: {
                organizationId: input.organizationId,
                contactId: input.contactId,
                date,
                inboundCount: 1,
            },
            update: { inboundCount: { increment: 1 } },
        });

        return message;
    }

    findByIdempotencyKey(idempotencyKey: string) {
        return this.prisma.message.findUnique({ where: { idempotencyKey } })
    }

    async createOutbound(tx: Prisma.TransactionClient, outbound: CreateOutboundInput) {
        const queuedAt = new Date();
        const messagePreview = outbound.text.trim().slice(0, PREVIEW_LENGTH) || null;
        const conversation = await tx.conversation.upsert({
            where: { channelId_contactId: { channelId: outbound.channelId, contactId: outbound.contactId } },
            create: {
                organizationId: outbound.organizationId,
                channelId: outbound.channelId,
                contactId: outbound.contactId,
                platform: outbound.platform,
                lastMessageAt: queuedAt,
                lastMessagePreview: messagePreview,
                messageCount: 1,
            },
            update: {
                lastMessageAt: queuedAt,
                lastMessagePreview: messagePreview,
                messageCount: { increment: 1 },
            },
        });

        return tx.message.create({
            data: {
                organizationId: outbound.organizationId,
                channelId: outbound.channelId,
                platform: outbound.platform,
                conversationId: conversation.id,
                contactId: outbound.contactId,
                direction: MessageDirection.OUTBOUND,
                kind: outbound.kind,
                status: MessageStatus.QUEUED,
                toAddress: outbound.toAddress,
                fromAddress: outbound.fromAddress,
                inReplyToExternalId: outbound.inReplyToExternalId ?? null,
                text: outbound.text,
                body: outbound.body as Prisma.InputJsonValue,
                idempotencyKey: outbound.idempotencyKey,
                automationId: outbound.automationId,
                automationRunId: outbound.automationRunId,
                stepKey: outbound.stepKey,
            },
        });
    }

    /** Meta refused the message: FAILED row + contact streak (and maybe mute) + today's failed count, one transaction. */
    async markFailed(messageId: string, failure: MarkFailedInput) {
        const failedAt = new Date();
        const today = dayOf(failedAt);

        return this.prisma.$transaction(async (tx) => {
            const failedMessage = await tx.message.update({
                where: { id: messageId },
                data: {
                    status: MessageStatus.FAILED,
                    errorCode: failure.code,
                    errorMessage: failure.message.slice(0, ERROR_MESSAGE_MAX),
                    responsePayload: (failure.response ?? undefined) as Prisma.InputJsonValue | undefined,
                    failedAt,
                },
                select: { id: true, contactId: true, organizationId: true },
            });

            if (failedMessage.contactId) {
                await this.contacts.recordFailed(tx, failedMessage.contactId, failedAt, failure.mute);

                await tx.contactDailyStat.upsert({
                    where: { contactId_date: { contactId: failedMessage.contactId, date: today } },
                    create: {
                        organizationId: failedMessage.organizationId,
                        contactId: failedMessage.contactId,
                        date: today,
                        failedCount: 1,
                    },
                    update: { failedCount: { increment: 1 } },
                });
            }

            return failedMessage;
        });
    }

    /** Status + contact counters + daily stat + conversation, one transaction. */
    async markSent(
        messageId: string,
        sendResult: { externalId: string | null; response: unknown; recipientId?: string | null },
    ) {
        const sentAt = new Date();
        const today = dayOf(sentAt);

        return this.prisma.$transaction(async (tx) => {
            const sentMessage = await tx.message.update({
                where: { id: messageId },
                data: {
                    status: MessageStatus.SENT,
                    externalId: sendResult.externalId,
                    responsePayload: sendResult.response as Prisma.InputJsonValue,
                    sentAt,
                },
                select: { id: true, contactId: true, conversationId: true, organizationId: true },
            });

            if (sentMessage.contactId) {
                await this.contacts.recordSent(tx, sentMessage.contactId, sentAt, sendResult.recipientId);

                // Today's sent count is what the daily cap in evaluateSendGate reads.
                await tx.contactDailyStat.upsert({
                    where: { contactId_date: { contactId: sentMessage.contactId, date: today } },
                    create: {
                        organizationId: sentMessage.organizationId,
                        contactId: sentMessage.contactId,
                        date: today,
                        sentCount: 1,
                    },
                    update: { sentCount: { increment: 1 } },
                });
            }

            if (sentMessage.conversationId) {
                await tx.conversation.update({
                    where: { id: sentMessage.conversationId },
                    data: { lastOutboundAt: sentAt, lastMessageAt: sentAt },
                });
            }

            return sentMessage;
        });
    }
}