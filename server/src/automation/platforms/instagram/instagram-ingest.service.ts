import { Injectable, Logger } from '@nestjs/common';
import { ChannelPlatform, MessageKind } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContactService } from '../../messaging/contact.service';
import { MessageService } from '../../messaging/message.service';
import { AutomationEventService, InboundEventType } from '../../automation-event.service';
import { AutomationEventsQueue } from '../../automation-events.queue';
import { InboundItem } from './instagram-webhook.parser';
import { isUniqueViolation } from '../../../prisma/prisma-errors.util';

export interface IngestChannel {
    id: string;
    organizationId: string;
    externalStoreId: string | null;
}

export type IngestOutcome = 'stored' | 'redelivery';

/** Instagram attachment type → MessageKind. The schema only has IMAGE for media. */
function messageKindFor(type?: string): MessageKind {
    return type === 'image' ? MessageKind.IMAGE : MessageKind.TEXT;
}

/**
 * Files one parsed inbound item: contact, (message for DMs), event.
 * All in one transaction so a redelivered webhook sees everything or nothing.
 */
@Injectable()
export class InstagramIngestService {
    private readonly logger = new Logger(InstagramIngestService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly contacts: ContactService,
        private readonly messages: MessageService,
        private readonly events: AutomationEventService,
        private readonly eventsQueue: AutomationEventsQueue,
    ) { }

    async ingestItem(channel: IngestChannel, item: InboundItem): Promise<IngestOutcome> {
        const eventType: InboundEventType = item.kind === 'comment' ? 'instagram.comment' : 'instagram.message';

        const seen = await this.events.findByKey(this.prisma, channel.organizationId, eventType, item.externalId,);
        if (seen) {
            this.logger.log(`Instagram ${item.kind} ${item.externalId}: redelivery, event exists`);
            return 'redelivery';
        }

        if (item.kind === 'dm') {
            const duplicate = await this.messages.findInboundByExternalId(this.prisma, channel.id, item.externalId,);
            if (duplicate) {
                this.logger.log(`Instagram dm ${item.externalId}: redelivery, message exists`);
                return 'redelivery';
            }
        }

        const base = {
            organizationId: channel.organizationId,
            channelId: channel.id,
            platform: ChannelPlatform.INSTAGRAM,
        };

        try {
            // 2. One transaction for the three writes.
            const result = await this.prisma.$transaction(async (tx) => {
                // 3. Contact card.
                const contact = await this.contacts.upsertFromInbound(tx, {
                    ...base,
                    externalId: item.actorExternalId,
                    username: item.kind === 'comment' ? item.actorUsername : undefined,
                    kind: item.kind === 'comment' ? 'comment' : 'message',
                    at: item.occurredAt,
                });

                // 4. Message row, DMs only.
                let messageId: string | undefined;
                if (item.kind === 'dm') {
                    const stored = await this.messages.recordInbound(tx, {
                        ...base,
                        contactId: contact.id,
                        toAddress: channel.externalStoreId ?? '',
                        fromAddress: item.actorExternalId,
                        externalId: item.externalId,
                        text: item.text,
                        kind: messageKindFor(item.attachments[0]?.type),
                        body: item.raw,
                        occurredAt: item.occurredAt,
                    });
                    messageId = stored.id;
                }

                // 5. Visitor-log row.
                const event = await this.events.record(tx, {
                    ...base,
                    eventType,
                    externalId: item.externalId,
                    occurredAt: item.occurredAt,
                    contactId: contact.id,
                    messageId,
                    mediaExternalId: item.kind === 'comment' ? item.mediaExternalId : undefined,
                    actorExternalId: item.actorExternalId,
                    actorUsername: item.kind === 'comment' ? item.actorUsername : undefined,
                    text: item.text,
                    payload: item.raw,
                });

                return { contactId: contact.id, eventId: event.id, messageId };
            });

            // 6. One log line per stored item.
            this.logger.log(
                `Instagram ${item.kind} ${item.externalId}: contact ${result.contactId}, ` +
                `event ${result.eventId}${result.messageId ? `, message ${result.messageId}` : ''}`,
            );

            // 7. Hand the event to the engine. AFTER the transaction on purpose: a job
            // must never point at rows that rolled back. A lost enqueue is picked up
            // by WaitResumeScheduler's unprocessed-events sweep.
            await this.eventsQueue.enqueueMatch(result.eventId, channel.organizationId).catch((err) =>
                this.logger.warn(
                    `Enqueue for event ${result.eventId} failed: ${err instanceof Error ? err.message : String(err)}`,
                ),
            );
            return 'stored';
        } catch (err) {
            // 7. Two deliveries raced past the checks in step 1: the DB unique index
            // refused the second one. That is a redelivery, not an error.
            if (isUniqueViolation(err)) {
                this.logger.log(`Instagram ${item.kind} ${item.externalId}: redelivery (unique race)`);
                return 'redelivery';
            }
            throw err;
        }
    }
}