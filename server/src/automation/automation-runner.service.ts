import { Injectable, Logger } from "@nestjs/common";
import { BlockDeps, ExecuteContext, ExecuteResult, TemplateContext } from "./blocks/block.types";
import { PrismaService } from "src/prisma/prisma.service";
import { AutomationRunStatus, AutomationStatus, Prisma } from "@prisma/client";
import { parseDefinition } from "./blocks/definition.schema";
import { resolveSettings } from "./send-gate";
import { getExecutor } from "./blocks/registry";
import { OutboundService } from "./messaging/outbound.service";

export type RunOutcome =
    | { status: 'completed' | 'failed' | 'skipped' | 'cancelled' | 'noop' }
    | { status: 'waiting'; resumeAt: Date; stepKey: string };

const FINISHED_RUN_STATUSES: AutomationRunStatus[] = [
    AutomationRunStatus.COMPLETED, AutomationRunStatus.FAILED, AutomationRunStatus.SKIPPED, AutomationRunStatus.CANCELLED,
];
const RESUME_EARLY_TOLERANCE_MS = 1_000;

@Injectable()
export class AutomationRunnerService {
    private readonly logger = new Logger(AutomationRunnerService.name)
    private readonly deps: BlockDeps

    constructor(
        private readonly prisma: PrismaService,
        outbound: OutboundService
    ) {
        this.deps = { outbound }
    }

    /** Walk from currentStepKey until wait / end / skip / fail. */
    async advanceRun(runId: string): Promise<RunOutcome> {
        const run = await this.prisma.automationRun.findUnique({
            where: { id: runId },
            include: {
                version: { select: { definition: true, settings: true } },
                automation: {
                    select: {
                        id: true,
                        status: true,
                        channelId: true,
                        channel: {
                            select: { externalStoreId: true }
                        }
                    }
                },
                contact: true,
                event: {
                    select: {
                        externalId: true, eventType: true, occurredAt: true
                    }
                }
            }
        })

        if (!run || FINISHED_RUN_STATUSES.includes(run.status)) return { status: 'noop' }

        const automation = run.automation;

        if (automation.status === AutomationStatus.ARCHIVED) {
            await this.finishRun(run.id, AutomationRunStatus.CANCELLED);
            return { status: 'cancelled' };
        }
        if (automation.status !== AutomationStatus.ACTIVE) return { status: 'noop' };
        if (!automation.channelId) {
            await this.finishRun(run.id, AutomationRunStatus.SKIPPED, { skipReason: 'no_channel' })
            return { status: 'skipped' }
        }

        const publishedSteps = parseDefinition(run.version.definition)
        const settings = resolveSettings(run.version.settings)
        let stepIndex = publishedSteps.findIndex((step) => step.id === run.currentStepKey);
        const hasNothingLeftToRun = stepIndex < 0;
        if (hasNothingLeftToRun) {
            await this.finishRun(run.id, AutomationRunStatus.COMPLETED);
            return { status: 'completed' };
        }

        await this.prisma.automationRun.update({
            where: { id: run.id },
            data: { status: AutomationRunStatus.RUNNING }
        })

        for (; stepIndex < publishedSteps.length; stepIndex++) {
            const currentStep = publishedSteps[stepIndex];
            const stepsAlreadyRun = publishedSteps.slice(0, stepIndex);
            const nextStepKey = publishedSteps[stepIndex + 1]?.id ?? null

            const executeContext: ExecuteContext = {
                dry: false,
                organizationId: run.organizationId,
                automationId: run.automationId,
                channelId: automation.channelId,
                channelExternalId: automation.channel?.externalStoreId ?? '',
                run: {
                    id: run.id,
                    contactId: run.contactId,
                    context: run.context as TemplateContext,
                    eventId: run.eventId,
                },
                event: run.event,
                contact: run.contact,
                settings,
                step: currentStep,
                priorSteps: stepsAlreadyRun,
            };

            const stepResult = await this.executeStep(executeContext);
            if (stepResult.kind === 'wait') {
                await this.prisma.automationRun.update({
                    where: { id: run.id },
                    data: { status: AutomationRunStatus.WAITING, resumeAt: stepResult.resumeAt, currentStepKey: nextStepKey },
                })

                return { status: 'waiting', resumeAt: stepResult.resumeAt, stepKey: currentStep.id };
            }

            if (stepResult.kind === 'skip') {
                await this.finishRun(run.id, AutomationRunStatus.SKIPPED, { skipReason: stepResult.reason })

                return { status: 'skipped' }
            }

            if (stepResult.kind === 'fail') {
                await this.finishRun(run.id, AutomationRunStatus.FAILED, { error: stepResult.error })
                await this.prisma.automation.update({
                    where: { id: run.automationId },
                    data: {
                        lastError: stepResult.error.slice(0, 500),
                        lastErrorAt: new Date()
                    }
                })

                return { status: 'failed' }
            }
            await this.prisma.automationRun.update({
                where: { id: run.id },
                data: { currentStepKey: publishedSteps[stepIndex + 1]?.id ?? null },
            })
        }

        // Ran out of steps: the journey is over.
        await this.finishRun(run.id, AutomationRunStatus.COMPLETED)
        return { status: 'completed' }
    }

    /** A WAITING run woken by its delayed job or the sweeper. */
    async resume(runId: string): Promise<RunOutcome> {
        const run = await this.prisma.automationRun.findUnique({
            where: { id: runId },
            select: {
                status: true,
                resumeAt: true,
                currentStepKey: true
            }
        })

        if (!run || run.status !== AutomationRunStatus.WAITING) return { status: 'noop' }
        const isTooEarly = run.resumeAt !== null && run.resumeAt.getTime() > Date.now() + RESUME_EARLY_TOLERANCE_MS;
        if (isTooEarly) return { status: 'noop' };

        const claimed = await this.prisma.automationRun.updateMany({
            where: { id: runId, status: AutomationRunStatus.WAITING },
            data: { status: AutomationRunStatus.PENDING, resumeAt: null },
        });
        if (claimed.count === 0) return { status: 'noop' };

        if (!run.currentStepKey) {
            await this.finishRun(runId, AutomationRunStatus.COMPLETED);
            return { status: 'completed' };
        }

        return this.advanceRun(runId);
    }

    /** Step row around one execute call. A RUNNING row left by a parked/retried job is reused. */
    private async executeStep(executeContext: ExecuteContext): Promise<ExecuteResult> {
        const { step, run } = executeContext;

        const executeBlock = getExecutor(step.type)
        if (!executeBlock) return { kind: 'fail', error: `unknown block ${step.type}`, permanent: true }

        const latestAttempt = await this.prisma.automationRunStep.findFirst({
            where: { runId: run.id, stepKey: step.id },
            orderBy: { attempt: 'desc' }
        })

        const isResumingAttempt = latestAttempt?.status === AutomationRunStatus.RUNNING
        const stepRow = isResumingAttempt
            ? latestAttempt
            : await this.prisma.automationRunStep.create({
                data: {
                    organizationId: executeContext.organizationId,
                    runId: executeContext.run.id,
                    automationId: executeContext.automationId,
                    stepKey: step.id,
                    blockType: step.type,
                    attempt: (latestAttempt?.attempt ?? 0) + 1,
                    status: AutomationRunStatus.RUNNING,
                    input: step.config as Prisma.InputJsonValue
                }
            })

        const blockResult = await executeBlock(executeContext, this.deps)
        const stepStatus = blockResult.kind === 'done' || blockResult.kind === 'wait'
            ? AutomationRunStatus.COMPLETED
            : blockResult.kind === 'skip' ? AutomationRunStatus.SKIPPED : AutomationRunStatus.FAILED

        const stepOutput = {
            ...(blockResult.output ?? {}),
            ...(blockResult.kind === 'wait' ? { resumeAt: blockResult.resumeAt.toISOString() } : {}),
            ...(blockResult.kind === 'skip' ? { skipReason: blockResult.reason } : {})
        }
        await this.prisma.automationRunStep.update({
            where: { id: stepRow.id },
            data: {
                status: stepStatus,
                output: stepOutput as Prisma.InputJsonValue,
                messageId: blockResult.kind === 'done' ? (blockResult.messageId ?? null) : null,
                error: blockResult.kind === 'fail' ? blockResult.error : null,
                finishedAt: new Date()
            }
        })

        return blockResult
    }


    private finishRun(runId: string, finalStatus: AutomationRunStatus, extra: { skipReason?: string, error?: string } = {}) {
        return this.prisma.automationRun.update({
            where: { id: runId },
            data: { status: finalStatus, completedAt: new Date(), resumeAt: null, ...extra }
        })
    }
}