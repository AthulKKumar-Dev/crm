import { SendKind } from "../send-gate";
import { BlockExecute } from "./block.types";
import { renderTemplate } from "./definition.schema";

export const executeSendMessage: BlockExecute = async (ctx, deps) => {
    const stepConfig = ctx.step.config as { message: string };
    const messageText = renderTemplate(stepConfig.message, ctx.run.context);

    // The first send after a comment is the one private reply Meta allows per
    // comment. Anything after it is a DM and needs the 24 h window.
    const hasEarlierMessageStep = ctx.priorSteps.some((step) => step.type === 'send_message')
    const isPrivateReply = ctx.event?.eventType === 'instagram.comment' && !hasEarlierMessageStep
    const messageKind: SendKind = isPrivateReply ? 'private_reply' : 'dm';

    if (ctx.dry) return { kind: 'done', output: { text: messageText, kind: messageKind, simulated: true } }
    if (!ctx.contact || !ctx.event) return { kind: 'fail', error: 'run has no contact or event', permanent: true }

    const contactIgsid = (ctx.contact.metadata as { igsid?: string } | null)?.igsid ?? ctx.contact.externalId
    const commentId = ctx.event.externalId;

    const sendResult = await deps.outbound.send({
        organizationId: ctx.organizationId,
        channelId: ctx.channelId,
        channelExternalId: ctx.channelExternalId,
        contactId: ctx.contact.id,
        kind: messageKind,
        toAddress: isPrivateReply ? commentId : contactIgsid,
        anchorAt: isPrivateReply ? ctx.event.occurredAt : null,
        text: messageText,
        settings: ctx.settings,
        idempotencyKey: `run:${ctx.run.id}:${ctx.step.id}`,
        provenance: {
            automationId: ctx.automationId,
            automationRunId: ctx.run.id,
            stepKey: ctx.step.id,
            inReplyToExternalId: isPrivateReply ? ctx.event.externalId : undefined,
        }
    })

    if (sendResult.outcome === 'sent') {
        return {
            kind: 'done',
            messageId: sendResult.messageId,
            output: {
                text: messageText,
                externalId: sendResult.externalId,
                ...(sendResult.assumedSent ? { assumedSent: true } : {}),
            },
        };
    }

    if (sendResult.outcome === 'skipped') {
        return { kind: 'skip', reason: sendResult.reason, output: { text: messageText } };
    }

    return {
        kind: 'fail', error: sendResult.error, permanent: true, output: { text: messageText }
    }
}