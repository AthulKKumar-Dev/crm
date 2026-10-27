import { Injectable, Logger } from "@nestjs/common";
import { AutomationRunStatus, AutomationStatus, Prisma } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { AutomationSettings, resolveSettings } from "./send-gate";
import { dayOf } from "./messaging/message.service";
import { parseDefinition, StepDef } from "./blocks/definition.schema";

export type KeywordMatch = 'contains' | 'exact' | 'any';

interface MatchedAutomation {
    triggerId: string;
    automationId: string;
    publishedVersionId: string;
    settings: Prisma.JsonValue;
}

type MatchableEvent = {
    channelId: string | null;
    eventType: string;
    text: string | null;
    payload: Prisma.JsonValue;
};

/** Runs in these states delivered nothing, so they do not use up the contact's turn. */
const RUNS_THAT_DELIVERED_NOTHING: AutomationRunStatus[] = [
    AutomationRunStatus.SKIPPED,
    AutomationRunStatus.CANCELLED,
    AutomationRunStatus.FAILED,
];

/**
 * Does this comment satisfy the trigger's keyword rule?
 * `keywords` are already lower-cased and trimmed at publish time (keywordsFor).
 */
export function matchesKeywords(commentText: string | null | undefined, keywords: string[], matchMode: KeywordMatch) {
    if (matchMode === 'any') return true;

    const normalizedComment = (commentText ?? '').trim().toLowerCase();
    if (!normalizedComment || keywords.length === 0) return false;

    if (matchMode === 'exact') return keywords.includes(normalizedComment);

    return keywords.some((keyword) => normalizedComment.includes(keyword));
}

@Injectable()
export class TriggerMatcherService {
    private readonly logger = new Logger(TriggerMatcherService.name)

    constructor(private readonly prisma: PrismaService) { }

    /**
 * One stored event → the runs it starts. Writes a run per matching automation
 * in one transaction, stamps the event processed, and returns the ids of the
 * runs that should now execute.
 */
    async createRunsForEvent(eventId: string): Promise<string[]> {
        const event = await this.prisma.automationEvent.findUnique({
            where: { id: eventId },
            include: { contact: { select: { id: true, username: true, displayName: true } } }
        })

        if (!event || event.processedAt) return []

        const matchedAutomations = await this.findMatchingAutomations(event);
        const now = new Date();
        const runIdsToExecute: string[] = [];

        await this.prisma.$transaction(async (tx) => {
            if (matchedAutomations.length > 0 && event.contactId) {
                // Two comments from one person arrive as two parallel jobs; the lock
                // makes the second wait so once-per-contact actually holds.
                await tx.$queryRaw`SELECT id FROM channel_contacts WHERE id = ${event.contactId} FOR UPDATE`
            }

            for (const matched of matchedAutomations) {
                const settings = resolveSettings(matched.settings)
                const skipReason = event.contactId ? await this.oncePerContactSkip(tx, matched.automationId, event.contactId, settings, now) : null;
                const publishedVersion = await tx.automationVersion.findUnique({
                    where: { id: matched.publishedVersionId },
                    select: { definition: true }
                })
                const publishedSteps = publishedVersion ? parseDefinition(publishedVersion.definition) : []
                const triggerStep = publishedSteps[0]
                const firstActionStep = publishedSteps[1]

                // Job retry: the run may already exist. Check first; a failed INSERT
                // would abort the whole Postgres transaction and nothing after it could run.
                const alreadyCreated = await tx.automationRun.findUnique({
                    where: { automationId_eventId: { automationId: matched.automationId, eventId: event.id } },
                    select: { id: true },
                })
                if (alreadyCreated) continue

                const createdRun = await tx.automationRun.create({
                        data: {
                            organizationId: event.organizationId,
                            automationId: matched.automationId,
                            automationVersionId: matched.publishedVersionId,
                            triggerId: matched.triggerId,
                            eventId: event.id,
                            contactId: event.contactId,
                            status: skipReason ? AutomationRunStatus.SKIPPED : AutomationRunStatus.PENDING,
                            skipReason,
                            currentStepKey: skipReason ? null : (firstActionStep?.id ?? null),
                            context: this.buildRunContext(event.contact, publishedSteps) as Prisma.InputJsonValue,
                            startedAt: now,
                            completedAt: skipReason ? now : null
                        },
                    select: { id: true }
                })
                const runId = createdRun.id

                if (triggerStep) {
                    await tx.automationRunStep.create({
                        data: {
                            organizationId: event.organizationId,
                            runId,
                            automationId: matched.automationId,
                            stepKey: triggerStep.id,
                            blockType: 'trigger',
                            attempt: 1,
                            status: AutomationRunStatus.COMPLETED,
                            input: { eventId: event.id, text: event.text } as Prisma.InputJsonValue,
                            output: (skipReason ? { skipReason } : {}) as Prisma.InputJsonValue,
                            finishedAt: now
                        }
                    })
                }
                await tx.automation.update({
                    where: { id: matched.automationId },
                    data: {
                        triggeredCount: { increment: 1 },
                        lastTriggeredAt: now
                    }
                })
                if (event.contactId) {
                    await tx.contactDailyStat.upsert({
                        where: { contactId_date: { contactId: event.contactId, date: dayOf(now) } },
                        create: {
                            organizationId: event.organizationId,
                            contactId: event.contactId,
                            date: dayOf(now),
                            automationRunCount: 1
                        },
                        update: { automationRunCount: { increment: 1 } }
                    })
                }

                if (!skipReason) runIdsToExecute.push(runId)
            }

            await tx.automationEvent.update({
                where: { id: event.id },
                data: {
                    processedAt: now,
                    matchedRuns: matchedAutomations.length
                }
            })

        })

        this.logger.log(`Event ${eventId}: ${matchedAutomations.length} matched, ${runIdsToExecute.length} to run`);
        return runIdsToExecute;
    }

    async failEvent(eventId: string, error: string) {
        await this.prisma.automationEvent.updateMany({
            where: { id: eventId, processedAt: null },
            data: { processedAt: new Date(), error: error.slice(0, 1000) }
        })
    }

    /** One indexed query on (channel, type, subject, active), then keywords in code. */
    private async findMatchingAutomations(event: MatchableEvent): Promise<MatchedAutomation[]> {

        if (event.eventType !== 'instagram.comment' || !event.channelId) return []

        const commentedPostId = (event.payload as { mediaExternalId?: string } | null)?.mediaExternalId;
        if (!commentedPostId) return []

        const candidateTriggers = await this.prisma.automationTrigger.findMany({
            where: {
                channelId: event.channelId,
                triggerType: 'instagram.comment',
                subjectId: commentedPostId,
                isActive: true,
                automation: { status: AutomationStatus.ACTIVE, publishedVersionId: { not: null } },
            },
            select: {
                id: true,
                keywords: true,
                config: true,
                automation: { select: { id: true, publishedVersionId: true, settings: true } },
            },
        });

        return candidateTriggers
            .filter((trigger) => {
                const matchMode = (trigger.config as { match?: KeywordMatch } | null)?.match ?? 'contains';
                return matchesKeywords(event.text, trigger.keywords, matchMode);
            })
            .map((trigger) => ({
                triggerId: trigger.id,
                automationId: trigger.automation.id,
                publishedVersionId: trigger.automation.publishedVersionId!,
                settings: trigger.automation.settings,
            }));

    }

    /**
 * Has this contact already been through this automation within the period the
 * setting cares about? Returns the skip reason, or null to let the run proceed.
 */
    private async oncePerContactSkip(tx: Prisma.TransactionClient, automationId: string, contactId: string, settings: AutomationSettings, now: Date): Promise<string | null> {
        if (settings.oncePerContact === 'never') return null;

        const onlyToday = settings.oncePerContact === 'perDay';
        const priorRunCount = await tx.automationRun.count({
            where: {
                automationId,
                contactId,
                isTest: false,
                status: { notIn: RUNS_THAT_DELIVERED_NOTHING },
                ...(onlyToday ? { createdAt: { gte: dayOf(now) } } : {}),
            },
        });

        return priorRunCount > 0 ? 'once_per_contact' : null;
    }

    /**
 * Resolve the message variables once, when the run is created, so a message
 * sent after a wait step uses the same values as the one before it.
 */
    private buildRunContext(contact: { username: string | null, displayName: string | null } | null, steps: StepDef[]) {
        const contactName = contact?.displayName ?? contact?.username ?? '';
        const firstName = contactName.split(' ')[0];

        const firstMessageStep = steps.find((step) => step.type === 'send_message');
        const messageConfig = firstMessageStep?.config as { product?: string } | undefined;

        return {
            first_name: firstName,
            product_name: messageConfig?.product ?? '',
            order_number: '',
        };
    }
}