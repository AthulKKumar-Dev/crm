import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ChannelStatus, SyncStatus } from '@prisma/client';
import { SYNC_QUEUE, SyncJobData } from './sync.queue';
import { ShopifySyncService } from './shopify-sync.service';
import { PrismaService } from '../prisma/prisma.service';

/// How many syncs may run at once. BullMQ's default is 1 — per queue, for the
/// whole deployment — so a single tenant's backfill blocked every other
/// tenant's sync behind it. Three fits comfortably inside the pool
/// (`connection_limit=10`) given each sync holds at most one interactive
/// transaction at a time.
const SYNC_CONCURRENCY = 3;

@Processor(SYNC_QUEUE, { concurrency: SYNC_CONCURRENCY })
export class SyncProcessor extends WorkerHost {
    private readonly logger = new Logger(SyncProcessor.name);

    constructor(
        private readonly syncService: ShopifySyncService,
        private readonly prisma: PrismaService,
    ) {
        super();
    }

    async process(job: Job<SyncJobData>): Promise<void> {
        const { channelId, organizationId, entityTypes } = job.data;

        this.logger.log(
            `Processing sync job ${job.id}: channel=${channelId}, entities=[${entityTypes.join(',')}]`,
        );

        await this.syncService.runSync(channelId, organizationId, entityTypes);

        this.logger.log(`Sync job ${job.id} completed`);
    }

    /**
     * Record a sync job that has given up for good.
     *
     * There was previously no failure handling anywhere in the server — no
     * worker event, no dead-letter queue, no alerting. Once BullMQ exhausted
     * `attempts`, the job landed in a failed set nobody reads and was evicted
     * after 50 more failures. The only trace was a log line.
     *
     * This fires ONLY on terminal exhaustion, not on each intermediate
     * attempt, so a transient blip that later succeeds does not mark the
     * channel broken. Everything it writes surfaces through endpoints that
     * already exist (`GET /channels/:id/sync-logs`, `channel.findOne`).
     */
    @OnWorkerEvent('failed')
    async onFailed(job: Job<SyncJobData> | undefined, err: Error): Promise<void> {
        if (!job) return;
        const maxAttempts = job.opts?.attempts ?? 1;
        if (job.attemptsMade < maxAttempts) {
            this.logger.warn(
                `Sync job ${job.id} attempt ${job.attemptsMade}/${maxAttempts} failed: ${err?.message ?? err} — will retry.`,
            );
            return;
        }

        const { channelId, organizationId } = job.data ?? {};
        this.logger.error(
            `Sync job ${job.id} for channel ${channelId} FAILED PERMANENTLY after ${job.attemptsMade} attempt(s): ${err?.message ?? err}`,
            err?.stack,
        );
        if (!channelId) return;

        try {
            // `errorDetails` is a Json column that has existed since the
            // schema was written and has never been populated.
            const latest = await this.prisma.syncLog.findFirst({
                where: { channelId },
                orderBy: { startedAt: 'desc' },
                select: { id: true },
            });
            if (latest) {
                await this.prisma.syncLog.update({
                    where: { id: latest.id },
                    data: {
                        status: SyncStatus.FAILED,
                        completedAt: new Date(),
                        errorMessage: err?.message ?? String(err),
                        errorDetails: {
                            jobId: String(job.id ?? ''),
                            attemptsMade: job.attemptsMade,
                            maxAttempts,
                            organizationId: organizationId ?? null,
                            name: err?.name ?? null,
                            stack: err?.stack?.split('\n').slice(0, 12).join('\n') ?? null,
                            failedAt: new Date().toISOString(),
                        },
                    },
                });
            }

            await this.prisma.channel.update({
                where: { id: channelId },
                data: { syncStatus: SyncStatus.FAILED, status: ChannelStatus.ERROR },
            });
        } catch (recordErr) {
            // Never let the reporting path throw — it would be swallowed by
            // BullMQ and we would lose the original failure too.
            this.logger.error(
                `Could not record the terminal failure of sync job ${job.id}`,
                recordErr instanceof Error ? recordErr.stack : recordErr,
            );
        }
    }
}
