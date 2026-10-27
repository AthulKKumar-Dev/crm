import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "src/prisma/prisma.service";
import { AutomationEventsQueue } from "./automation-events.queue";
import { AutomationRunStatus, AutomationStatus } from "@prisma/client";

const GRACE_MS = 60_000;
const BATCH = 200

@Injectable()
export class WaitResumeScheduler {
    private readonly logger = new Logger(WaitResumeScheduler.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly queue: AutomationEventsQueue
    ) { }

    @Cron(CronExpression.EVERY_5_MINUTES)
    async sweep() {
        const cutoff = new Date(Date.now() - GRACE_MS)
        const events = await this.prisma.automationEvent.findMany({
            where: { processedAt: null, eventType: 'instagram.comment', createdAt: { lt: cutoff } },
            select: { id: true, organizationId: true },
            take: BATCH
        })

        for (const e of events) await this.queue.enqueueMatch(e.id, e.organizationId)

        // PENDING runs whose `run` job was lost (crash between the matcher's commit and the enqueue).
        const orphans = await this.prisma.automationRun.findMany({
            where: { status: AutomationRunStatus.PENDING, createdAt: { lt: cutoff }, automation: { status: AutomationStatus.ACTIVE } },
            select: { id: true, organizationId: true },
            take: BATCH
        })

        for (const run of orphans) await this.queue.enqueueRun(run.id, run.organizationId)

        const due = await this.prisma.automationRun.findMany({
            where: { status: AutomationRunStatus.WAITING, resumeAt: { lte: new Date() }, automation: { status: AutomationStatus.ACTIVE } },
            select: { id: true, organizationId: true, currentStepKey: true, resumeAt: true },
            take: BATCH
        })

        for (const r of due) await this.queue.enqueueResume(r.id, r.organizationId, r.currentStepKey ?? 'end', r.resumeAt ?? new Date())

        if (events.length || orphans.length || due.length) {
            this.logger.log(`Sweep: ${events.length} events, ${orphans.length} pending runs, ${due.length} due waits`)
        }
    }
}