import { ShopifyPushEnqueuer } from './shopify-push.enqueuer';

/**
 * BullMQ reserves ":" as its Redis key separator and rejects any custom job id
 * containing one (`Custom Id cannot contain :` — bullmq/classes/job.js).
 *
 * The order-push id used to be `push-order:${orderId}`, so EVERY offline order
 * threw at enqueue, before a single Shopify call. The push was swallowed as a
 * warning and the order was left stamped "Sync failed" with no usable reason,
 * which is how it went unnoticed. Observed on DEV 2026-09-05.
 */
describe('ShopifyPushEnqueuer — order push job id', () => {
  function build() {
    const queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({ id: 'job_1' }),
    };
    return { queue, enqueuer: new ShopifyPushEnqueuer(queue as any) };
  }

  const data = { type: 'order' as const, orderId: 'order_1', organizationId: 'org_1' };

  it('mints a job id BullMQ will accept', async () => {
    const { queue, enqueuer } = build();

    await expect(enqueuer.enqueueOrderPush(data)).resolves.toBe(true);

    const jobId = queue.add.mock.calls[0][2].jobId as string;
    expect(jobId).not.toContain(':');
    expect(jobId).toBe('push-order-order_1');
  });

  it('still de-duplicates per order, so two Sync presses enqueue once', async () => {
    const { queue, enqueuer } = build();
    queue.getJob.mockResolvedValue({ getState: async () => 'waiting' });

    await expect(enqueuer.enqueueOrderPush(data)).resolves.toBe(true);

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('reports failure to the caller instead of leaving the order "syncing" for ever', async () => {
    const { queue, enqueuer } = build();
    queue.add.mockRejectedValue(new Error('redis down'));

    await expect(enqueuer.enqueueOrderPush(data)).resolves.toBe(false);
  });
});

/**
 * Product pushes had neither a per-product job id nor a return value: a Sync
 * press between the worker's retries queued a second job (a second Shopify
 * product), and a queue outage was swallowed while the caller stamped the
 * product PENDING — "Syncing" for ever.
 */
describe('ShopifyPushEnqueuer — product push', () => {
  function build() {
    const queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({ id: 'job_1' }),
    };
    return { queue, enqueuer: new ShopifyPushEnqueuer(queue as any) };
  }

  const data = { type: 'product' as const, productId: 'prod_1', organizationId: 'org_1' };

  it('queues under one id per product', async () => {
    const { queue, enqueuer } = build();

    await expect(enqueuer.enqueueProductPush(data)).resolves.toBe(true);

    expect(queue.add.mock.calls[0][2].jobId).toBe('push-product-prod_1');
  });

  it('does not queue a second job while one is waiting on a retry', async () => {
    const { queue, enqueuer } = build();
    queue.getJob.mockResolvedValue({ getState: async () => 'delayed' });

    await expect(enqueuer.enqueueProductPush(data)).resolves.toBe(true);

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('replaces a finished job so a later retry is not ignored', async () => {
    const { queue, enqueuer } = build();
    const remove = jest.fn().mockResolvedValue(undefined);
    queue.getJob.mockResolvedValue({ getState: async () => 'failed', remove });

    await expect(enqueuer.enqueueProductPush(data)).resolves.toBe(true);

    expect(remove).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('reports a queue failure instead of swallowing it', async () => {
    const { queue, enqueuer } = build();
    queue.add.mockRejectedValue(new Error('redis down'));

    await expect(enqueuer.enqueueProductPush(data)).resolves.toBe(false);
  });
});
