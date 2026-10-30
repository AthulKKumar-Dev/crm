import { Processor, WorkerHost } from "@nestjs/bullmq";
import { AutomationEventsQueue, AutomationJobData, AUTOMATION_EVENTS_QUEUE, MatchJobData, RunJobData } from "./automation-events.queue";
import { Logger } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { TriggerMatcherService } from "./trigger-matcher.service";
import { AutomationRunnerService } from "./automation-runner.service";
import { isRateLimitedError } from "src/rate-limit/rate-limit.types";
import { parkIfRateLimited } from "src/rate-limit/bullmq-park.util";

const CONCURRENCY = Number.parseInt(process.env.AUTOMATION_CONCURRENCY ?? '3', 10) || 3;

@Processor(AUTOMATION_EVENTS_QUEUE, { concurrency: CONCURRENCY })
export class AutomationEventProcessor extends WorkerHost {
    private readonly logger = new Logger(AutomationEventProcessor.name)

    constructor(
        private readonly matcher: TriggerMatcherService,
        private readonly runner: AutomationRunnerService,
        private readonly queue: AutomationEventsQueue
    ) {
        super()
    }

    async process(job: Job<AutomationJobData>, token?: string) {
        try {
            if (job.name === 'match') return await this.match(job as Job<MatchJobData>)
            return await this.run(job as Job<RunJobData>)
        } catch (error) {
            if (isRateLimitedError(error) && error.scope.kind === 'app') {
                const ms = Math.max(1_000, error.retryAtMs - Date.now())
                this.logger.warn(JSON.stringify({
                    event: 'rate_limit.worker_paused',
                    queue: AUTOMATION_EVENTS_QUEUE,
                    ms
                }))

                await this.queue.pauseForRateLimit(ms)
                throw Worker.RateLimitError()
            }

            await parkIfRateLimited(error, job, token, this.logger)
        }
    }

    private async match(job: Job<MatchJobData>) {
        const { eventId, organizationId } = job.data
        try {
            const runIdsToExecute = await this.matcher.createRunsForEvent(eventId);
            for (const runId of runIdsToExecute) {
                await this.queue.enqueueRun(runId, organizationId);
            }
        } catch (error) {
            const currentAttempt = job.attemptsMade + 1;
            const maxAttempts = job.opts.attempts ?? 1;
            const isLastAttempt = currentAttempt >= maxAttempts;

            if (isLastAttempt && !isRateLimitedError(error)) {
                // Mark processed-with-error, or the sweeper re-enqueues this event forever.
                const failureReason = error instanceof Error ? error.message : String(error);
                await this.matcher.failEvent(eventId, failureReason);
            }

            throw error;
        }
    }

    private async run(job: Job<RunJobData>) {
        const { runId, organizationId } = job.data
        const outcome = job.name === 'resume' ? await this.runner.resume(runId) : await this.runner.advanceRun(runId)
        if (outcome.status === 'waiting') {
            await this.queue.enqueueResume(runId, organizationId, outcome.stepKey, outcome.resumeAt)
        }
        this.logger.log(`Run ${runId}:${outcome.status}`)
    }
}