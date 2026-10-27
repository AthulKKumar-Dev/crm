import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { Priority } from "src/rate-limit/rate-limit.types";

export const AUTOMATION_EVENTS_QUEUE = 'automation-events'
/** job.name decides the shape. */
export type AutomationJobName = 'match' | 'run' | 'resume'

export interface MatchJobData {
    eventId: string,
    organizationId: string,
    priority: Priority
}
export interface RunJobData {
    runId: string,
    organizationId: string,
    stepKey?: string,
    priority: Priority
}
export type AutomationJobData = MatchJobData | RunJobData

/** removeOnComplete: true so a sweeper re-add by the same id is never silently dropped. */
export const AUTOMATION_JOB_OPTIONS = {
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 10_000 },
    removeOnComplete: true,
    removeOnFail: { age: 60 * 60 * 24 * 7 },
}

/** Hyphens only: BullMQ reserves ":" and rejects ids containing it. */
export const automationJobId = {
    match: (eventId: string,) => `evt-${eventId}`,
    run: (runId: string) => `run-${runId}`,
    resume: (runId: string, stepKey: string) => `resume-${runId}-${stepKey}`
}

@Injectable()
export class AutomationEventsQueue {
    private readonly logger = new Logger(AutomationEventsQueue.name)

    constructor(
        @InjectQueue(AUTOMATION_EVENTS_QUEUE)
        private readonly queue: Queue<AutomationJobData>
    ) { }

    enqueueMatch(eventId: string, organizationId: string) {
        return this.add('match', { eventId, organizationId, priority: Priority.NORMAL }, automationJobId.match(eventId))
    }

    enqueueRun(runId: string, organizationId: string) {
        return this.add('run', { runId, organizationId, priority: Priority.NORMAL }, automationJobId.run(runId))
    }

    enqueueResume(runId: string, organizationId: string, stepKey: string, resumeAt: Date) {
        const delay = Math.max(0, resumeAt.getTime() - Date.now())
        return this.add('resume', { runId, organizationId, stepKey, priority: Priority.NORMAL }, automationJobId.resume(runId, stepKey), delay)
    }

    /** Hold every job in this queue for `ms`: Meta rate-limited the whole app, not one merchant. */
    pauseForRateLimit(ms: number) {
        return this.queue.rateLimit(ms)
    }

    /** A live job with this id wins; a finished or failed one is replaced. */
    private async add(name: AutomationJobName, data: AutomationJobData, jobId: string, delay = 0): Promise<boolean> {
        const existingJob = await this.queue.getJob(jobId)
        if (existingJob) {
            const existingState = await existingJob.getState()
            if (existingState === 'completed' || existingState === 'failed') await existingJob.remove()
            else { this.logger.debug(`${jobId} already ${existingState}`); return false; }
        }

        await this.queue.add(name, data, { ...AUTOMATION_JOB_OPTIONS, jobId, priority: data.priority, delay })
        return true
    }
}