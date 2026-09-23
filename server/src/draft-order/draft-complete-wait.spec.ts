import { DraftOrderService } from './draft-order.service';

/**
 * Completing a draft through Shopify: the local order arrives via the
 * orders/create webhook a moment AFTER draftOrderComplete returns. The old
 * code looked it up once, immediately, found nothing, and returned
 * `order: null` — which the page then crashed on.
 */
describe('DraftOrderService.waitForLocalOrder', () => {
  const original = DraftOrderService.LOCAL_ORDER_WAIT;
  beforeAll(() => {
    DraftOrderService.LOCAL_ORDER_WAIT = { attempts: 4, intervalMs: 1 };
  });
  afterAll(() => {
    DraftOrderService.LOCAL_ORDER_WAIT = original;
  });

  function build(results: Array<{ id: string; name: string } | null>) {
    const findFirst = jest.fn();
    for (const r of results) findFirst.mockResolvedValueOnce(r);
    findFirst.mockResolvedValue(null);
    const prisma = { order: { findFirst } };
    const service = new DraftOrderService(
      prisma as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any,
    );
    const wait = (id: string) =>
      (service as any).waitForLocalOrder('org_1', 'ch_shopify', id) as Promise<unknown>;
    return { wait, findFirst };
  }

  it('returns the order once the webhook has written it', async () => {
    const { wait, findFirst } = build([null, null, { id: 'ord_1', name: '#1015' }]);

    await expect(wait('7181')).resolves.toEqual({ id: 'ord_1', name: '#1015' });
    expect(findFirst).toHaveBeenCalledTimes(3);
    expect(findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org_1', channelId: 'ch_shopify', externalId: '7181' },
      select: { id: true, name: true },
    });
  });

  it('gives up after the configured attempts and returns null', async () => {
    const { wait, findFirst } = build([]);

    await expect(wait('7181')).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledTimes(4);
  });

  it('does not wait at all when the order is already there', async () => {
    const { wait, findFirst } = build([{ id: 'ord_1', name: '#1015' }]);

    await wait('7181');
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
