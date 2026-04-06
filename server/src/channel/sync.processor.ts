import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SYNC_QUEUE, SyncJobData } from './sync.queue';
import { ShopifySyncService } from './shopify-sync.service';

@Processor(SYNC_QUEUE)
export class SyncProcessor extends WorkerHost {
    private readonly logger = new Logger(SyncProcessor.name);

    constructor(private readonly syncService: ShopifySyncService) {
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
}