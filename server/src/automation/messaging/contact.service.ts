import { Injectable } from '@nestjs/common';
import { ChannelPlatform, Prisma } from '@prisma/client';

export interface UpsertContactInput {
    organizationId: string;
    channelId: string;
    platform: ChannelPlatform;
    /** IGSID for DMs, commenter id for comments. Linked later by the outbound step. */
    externalId: string;
    username?: string;
    kind: 'comment' | 'message';
    at: Date;
}

const MS_PER_HOUR = 3_600_000;

/**
 * The address book: one row per person per connected account. Every inbound
 * item touches it so the window timestamps and counters the send gate reads
 * are always current.
 */
@Injectable()
export class ContactService {
    async upsertFromInbound(tx: Prisma.TransactionClient, input: UpsertContactInput) {
        const touch = input.kind === 'comment' ? { lastCommentAt: input.at } : { lastInboundMessageAt: input.at };

        return tx.channelContact.upsert({
            where: {
                channelId_externalId: { channelId: input.channelId, externalId: input.externalId },
            },
            create: {
                organizationId: input.organizationId,
                channelId: input.channelId,
                platform: input.platform,
                externalId: input.externalId,
                username: input.username ?? null,
                inboundCount: input.kind === 'message' ? 1 : 0,
                metadata: { idSource: input.kind },
                ...touch,
            },
            update: {
                ...(input.username ? { username: input.username } : {}),
                ...(input.kind === 'message' ? { inboundCount: { increment: 1 } } : {}),
                ...touch,
            },
        });
    }

    /** Called by MessageService.markFailed inside the same transaction as the status change. The one writer of mutedUntil. */
    async recordFailed(
        tx: Prisma.TransactionClient,
        contactId: string,
        failedAt: Date,
        mutePolicy?: { afterFailures: number; hours: number },
    ) {
        const updatedContact = await tx.channelContact.update({
            where: { id: contactId },
            data: {
                outboundCount: { increment: 1 },
                outboundFailedCount: { increment: 1 },
                consecutiveFailures: { increment: 1 },
                lastOutboundAt: failedAt,
            },
            select: { consecutiveFailures: true },
        });

        const shouldMute =
            mutePolicy !== undefined && updatedContact.consecutiveFailures >= mutePolicy.afterFailures;

        if (shouldMute) {
            const mutedUntil = new Date(failedAt.getTime() + mutePolicy.hours * MS_PER_HOUR);
            await tx.channelContact.update({ where: { id: contactId }, data: { mutedUntil } });
        }

        return updatedContact;
    }

    /** Called by MessageService.markSent inside the same transaction as the status change. */
    async recordSent(tx: Prisma.TransactionClient, contactId: string, sentAt: Date, igsid?: string | null,) {
        const contact = await tx.channelContact.findUnique({
            where: { id: contactId },
            select: { metadata: true }
        })

        const existingMetadata = (contact?.metadata && typeof contact.metadata === 'object' && !Array.isArray(contact.metadata) ? contact.metadata : {}) as Record<string, unknown>
        const metadataUpdate = igsid
            ? { metadata: { ...existingMetadata, igsid } as Prisma.InputJsonValue }
            : {};

        return tx.channelContact.update({
            where: { id: contactId },
            data: {
                outboundCount: { increment: 1 },
                outboundSentCount: { increment: 1 },
                consecutiveFailures: 0,
                lastOutboundAt: sentAt,
                ...metadataUpdate,
            },
        });
    }
}