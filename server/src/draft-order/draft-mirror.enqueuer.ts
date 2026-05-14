import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DRAFT_MIRROR_QUEUE, DraftMirrorJobData } from './draft-mirror.queue';

/**
 * Retry policy mirrors the existing shopify-push queue: 5 attempts with
 * exponential backoff (10s → 20s → 40s → 80s → 160s). Failed jobs hang
 * around for 30 days for inspection; completed jobs are cleared after a
 * week.
 *
 * Drafts often get edited multiple times in quick succession (the user
 * is iterating). Each edit enqueues a job. BullMQ deduplicates by ID if
 * we pass `jobId`, but here we don't — the processor is idempotent
 * (each run reads the current draft state fresh) so duplicate jobs are
 * harmless, just wasteful. If Shopify rate-limits become an issue we
 * can add per-draft jobId-based deduplication.
 */
const DEFAULT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 10_000 },
  removeOnComplete: { age: 60 * 60 * 24 * 7 }, // 7 days
  removeOnFail: { age: 60 * 60 * 24 * 30 }, // 30 days
};

@Injectable()
export class DraftMirrorEnqueuer {
  private readonly logger = new Logger(DraftMirrorEnqueuer.name);

  constructor(
    @InjectQueue(DRAFT_MIRROR_QUEUE)
    private readonly queue: Queue<DraftMirrorJobData>,
  ) {}

  async enqueueCreate(
    data: Extract<DraftMirrorJobData, { type: 'draft-create' }>,
  ): Promise<void> {
    try {
      await this.queue.add('mirror-create', data, DEFAULT_JOB_OPTS);
    } catch (err) {
      this.logger.error(
        `Failed to enqueue draft-create mirror for ${data.draftId}: ${err}`,
      );
    }
  }

  async enqueueUpdate(
    data: Extract<DraftMirrorJobData, { type: 'draft-update' }>,
  ): Promise<void> {
    try {
      await this.queue.add('mirror-update', data, DEFAULT_JOB_OPTS);
    } catch (err) {
      this.logger.error(
        `Failed to enqueue draft-update mirror for ${data.draftId}: ${err}`,
      );
    }
  }

  async enqueueDelete(
    data: Extract<DraftMirrorJobData, { type: 'draft-delete' }>,
  ): Promise<void> {
    try {
      await this.queue.add('mirror-delete', data, DEFAULT_JOB_OPTS);
    } catch (err) {
      this.logger.error(
        `Failed to enqueue draft-delete mirror for ${data.externalId}: ${err}`,
      );
    }
  }
}
