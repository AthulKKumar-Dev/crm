import { ChannelContact } from "@prisma/client";
import { StepDef } from "./definition.schema";
import { OutboundService } from "../messaging/outbound.service";
import { AutomationSettings } from "../send-gate";

export type TemplateContext = Record<string, string | null | number | undefined>

export interface ExecuteContext {
    dry: boolean;
    organizationId: string;
    automationId: string;
    channelId: string;
    /** Our Instagram account id (Channel.externalStoreId). */
    channelExternalId: string;
    run: {
        id: string;
        contactId: string | null;
        context: TemplateContext;
        eventId: string | null
    };
    event: {
        externalId: string;
        eventType: string;
        occurredAt: Date;
    } | null;
    contact: ChannelContact | null;
    settings: AutomationSettings;
    step: StepDef;
    /** Steps before this one: tells a send whether it is the first after the comment. */
    priorSteps: StepDef[]
}

/** Services a block may use. Handed in by the runner; blocks never import them (type-only above). */
export interface BlockDeps {
    outbound: OutboundService;
}

export type ExecuteResult = { kind: 'done', output?: Record<string, unknown>; messageId?: string }
    | { kind: 'wait'; resumeAt: Date; output?: Record<string, unknown> }
    | { kind: 'skip', reason: string, output?: Record<string, unknown> }
    | { kind: 'fail', error: string, permanent: boolean, output?: Record<string, unknown> }

export type BlockExecute = (ctx: ExecuteContext, deps: BlockDeps) => Promise<ExecuteResult>