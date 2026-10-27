import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { AutomationSettings, evaluateSendGate, SendKind } from "../send-gate";
import { dayOf, MessageService } from "./message.service";
import { ChannelPlatform, MessageKind, MessageStatus } from "@prisma/client";
import { isUniqueViolation } from "src/prisma/prisma-errors.util";
import { InstagramSendService } from "../platforms/instagram/instagram-send.service";
import { isRateLimitedError } from "src/rate-limit/rate-limit.types";

export interface OutboundRequest {
    organizationId: string,
    channelId: string,
    channelExternalId: string,
    contactId: string,
    kind: SendKind,
    /** Comment id for a private reply, IGSID for a DM. */
    toAddress: string,
    /** Private reply: the comment's own time. DM: null. */
    anchorAt: Date | null,
    text: string,
    settings: AutomationSettings,
    /** Stable across retries: "run:<runId>:<stepKey>". Never include the attempt. */
    idempotencyKey: string,
    provenance: {
        automationId: string,
        automationRunId: string,
        stepKey: string,
        inReplyToExternalId?: string
    }

}

export type OutboundResult = { outcome: 'sent', messageId: string, externalId: string | null, assumedSent?: boolean }
    | { outcome: 'skipped', reason: string }
    | { outcome: 'failed', messageId: string, error: string }


/**
 * The one way an automated message leaves the system: idempotency → gate →
 * QUEUED row → Meta → SENT/FAILED. Throws RateLimitedError and retryable
 * errors so the queue can park or retry; returns everything else.
 */
@Injectable()
export class OutboundService {
    private readonly logger = new Logger(OutboundService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly messages: MessageService,
        private readonly igSend: InstagramSendService
    ) { }

    async send(req: OutboundRequest): Promise<OutboundResult> {
        const isPrivateReply = req.kind === 'private_reply'

        // 1. have we been here before? (retry after a crash or a parked job)
        const existingMessage = await this.messages.findByIdempotencyKey(req.idempotencyKey)
        if (existingMessage?.status === MessageStatus.SENT) {
            return { outcome: 'sent', messageId: existingMessage.id, externalId: existingMessage.externalId }
        }

        if (existingMessage?.status === MessageStatus.FAILED) {
            return { outcome: 'failed', messageId: existingMessage.id, error: existingMessage.errorMessage ?? 'send failed' }
        }

        let messageId = existingMessage?.id
        // 2. First attempt: gate, then the QUEUED row.
        if (!messageId) {
            const contact = await this.prisma.channelContact.findUnique({ where: { id: req.contactId } })
            if (!contact) return { outcome: 'skipped', reason: 'no_contact' }

            const todayStats = await this.prisma.contactDailyStat.findUnique({
                where: { contactId_date: { contactId: req.contactId, date: dayOf(new Date()) } },
                select: { sentCount: true }
            })
            const gate = evaluateSendGate({
                contact,
                settings: req.settings,
                kind: req.kind,
                anchorAt: req.anchorAt,
                dailySent: todayStats?.sentCount ?? 0,
                now: new Date()
            })

            if (!gate.ok) return { outcome: 'skipped', reason: gate.reason }
            try {
                const queuedMessage = await this.prisma.$transaction((tx) =>
                    this.messages.createOutbound(tx, {
                        organizationId: req.organizationId,
                        channelId: req.channelId,
                        platform: ChannelPlatform.INSTAGRAM,
                        contactId: req.contactId,
                        kind: isPrivateReply ? MessageKind.PRIVATE_REPLY : MessageKind.TEXT,
                        toAddress: req.toAddress,
                        fromAddress: req.channelExternalId,
                        text: req.text,
                        body: { text: req.text },
                        inReplyToExternalId: req.provenance.inReplyToExternalId,
                        idempotencyKey: req.idempotencyKey,
                        automationId: req.provenance.automationId,
                        automationRunId: req.provenance.automationRunId,
                        stepKey: req.provenance.stepKey,
                    })
                )

                messageId = queuedMessage.id
            } catch (error) {
                if (isUniqueViolation(error)) return { outcome: "skipped", reason: 'private_reply_exists' }

                throw error
            }
        }

        // 3. A QUEUED row from an earlier attempt: the call may or may not have reached Meta.
        //    A DM is never re-sent (a duplicate is worse than a miss). A private reply may be
        //    retried because Meta itself refuses a second reply to the same comment.
        const isInDoubt = existingMessage !== null;
        if (isInDoubt && !isPrivateReply) {
            await this.messages.markFailed(messageId, { code: 'IN_DOUBT', message: 'Unconfirmed DM send from a previous attempt; not re-sent.' })

            return { outcome: 'failed', messageId: messageId, error: 'in_doubt' }
        }

        // 4. The call. Re-use the address stored on the row so a retry never changes recipient.
        const recipientAddress = existingMessage?.toAddress ?? req.toAddress
        try {
            const sendResult = isPrivateReply ?
                await this.igSend.sendPrivateReply({ channelId: req.channelId, commentId: recipientAddress, text: req.text })
                : await this.igSend.sendDirectMessage({ channelId: req.channelId, igsid: recipientAddress, text: req.text })

            await this.messages.markSent(messageId, {
                externalId: sendResult.externalId,
                response: sendResult.response,
                recipientId: sendResult.recipientId
            })

            return { outcome: 'sent', messageId: messageId, externalId: sendResult.externalId }

        } catch (error) {
            if (isRateLimitedError(error)) throw error

            const verdict = await this.igSend.classifySendError(error, req.channelId)
            // A retried private reply that Meta now refuses almost certainly went out the first time.
            const wasAlreadyDelivered = isInDoubt && isPrivateReply && verdict.permanent;
            if (wasAlreadyDelivered) {
                await this.messages.markSent(messageId, { externalId: null, response: verdict.response ?? { assumedSent: true, error: verdict.label } })

                return { outcome: 'sent', messageId: messageId, externalId: null, assumedSent: true }
            }

            if (!verdict.permanent) throw error

            await this.messages.markFailed(messageId, {
                code: verdict.code,
                message: verdict.label,
                response: verdict.response,
                mute: {
                    afterFailures: req.settings.maxConsecutiveFailures,
                    hours: req.settings.muteHoursAfterFailures
                }
            })

            this.logger.warn(`Outbound ${req.idempotencyKey} failed: ${verdict.code} ${verdict.label}`)
            return { outcome: 'failed', messageId: messageId, error: `${verdict.code} : ${verdict.label}` }
        }

    }
}