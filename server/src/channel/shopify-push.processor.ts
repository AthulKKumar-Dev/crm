import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SHOPIFY_PUSH_QUEUE, ShopifyPushJobData } from './shopify-push.queue';
import { ShopifyPushService } from './shopify-push.service';
import { ShopifyLocationSyncService } from './shopify-location-sync.service';

@Processor(SHOPIFY_PUSH_QUEUE)
export class ShopifyPushProcessor extends WorkerHost {
  private readonly logger = new Logger(ShopifyPushProcessor.name);

  constructor(
    private readonly pushService: ShopifyPushService,
    private readonly locationSync: ShopifyLocationSyncService,
  ) {
    super();
  }

  async process(job: Job<ShopifyPushJobData>): Promise<void> {
    const data = job.data;

    this.logger.log(
      `Push job ${job.id} (${data.type}) attempt ${job.attemptsMade + 1}`,
    );

    try {
      switch (data.type) {
        case 'order':
          await this.pushService.pushOrder(data.orderId, data.organizationId);
          break;
        case 'product':
          await this.pushService.pushProduct(data.productId, data.organizationId);
          break;
        case 'bulk-products':
          await this.pushService.bulkPushManualProducts(data.organizationId);
          break;
        case 'bulk-orders':
          await this.pushService.bulkPushUnsyncedOrders(data.organizationId);
          break;
        case 'push-availability':
          await this.pushService.pushAvailability(
            data.organizationId,
            data.variantIds,
          );
          break;
        case 'sync-locations':
          await this.locationSync.runForOrganization(data.organizationId);
          break;
        default: {
          // Exhaustiveness check — if a new job type is added without a
          // case here, TS will flag it.
          const _exhaustive: never = data;
          throw new Error(`Unknown push job type: ${JSON.stringify(_exhaustive)}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Push job ${job.id} (${data.type}) failed: ${msg}`);

      // Persist failure on the relevant entity's metadata so the merchant
      // can see the error in the UI. Bulk jobs already write per-product
      // failures inside bulkPushManualProducts, so we skip there.
      if (data.type === 'order') {
        await this.pushService
          .recordFailure(data.orderId, data.organizationId, msg)
          .catch(() => undefined);
      } else if (data.type === 'product') {
        await this.pushService
          .recordProductFailure(data.productId, data.organizationId, msg)
          .catch(() => undefined);
      }

      throw err; // bubble so BullMQ applies its retry policy
    }
  }
}
