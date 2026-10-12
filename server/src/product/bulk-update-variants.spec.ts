import { ChannelPlatform } from '@prisma/client';
import { ProductService } from './product.service';

/**
 * The product page now sends every variant edit — the panel's included —
 * through the bulk endpoint, so it has to do what the single-variant PATCH
 * does when tracking is switched on: create the stock rows, or the variant can
 * never be given stock.
 */
describe('ProductService.bulkUpdateVariants — tracking turned on', () => {
  const ORG = 'org-1';

  function build(variants: Array<{ id: string; trackQuantity: boolean }>) {
    const tx = {
      product: { findUnique: jest.fn().mockResolvedValue({ metadata: null }) },
    };
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'p1',
          vendor: null,
          channel: { platform: ChannelPlatform.MANUAL },
        }),
      },
      productVariant: {
        findMany: jest.fn().mockResolvedValue(
          variants.map((v) => ({ ...v, option1: null, option2: null, option3: null })),
        ),
      },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const before = new Map(variants.map((v) => [v.id, v]));
    const inventoryLedger = {
      // Echoes the row as it would be after the patch.
      auditedVariantUpdate: jest.fn(
        ({ variantId, data }: { variantId: string; data: { trackQuantity?: boolean } }) =>
          Promise.resolve({
            id: variantId,
            trackQuantity: data.trackQuantity ?? before.get(variantId)!.trackQuantity,
          }),
      ),
      ensureStockRows: jest.fn().mockResolvedValue(undefined),
    };
    const enqueuer = {
      enqueueAvailabilityPush: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ProductService(
      prisma as never,
      enqueuer as never,
      {} as never,
      inventoryLedger as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, inventoryLedger };
  }

  it('creates stock rows for a variant whose tracking was switched on', async () => {
    const { service, inventoryLedger } = build([
      { id: 'v1', trackQuantity: false },
      { id: 'v2', trackQuantity: true },
    ]);

    await service.bulkUpdateVariants('p1', ORG, {
      updates: [
        { variantId: 'v1', trackQuantity: true },
        { variantId: 'v2', price: 10 },
      ],
    });

    expect(inventoryLedger.ensureStockRows).toHaveBeenCalledTimes(1);
    const [, orgId, rows] = inventoryLedger.ensureStockRows.mock.calls[0];
    expect(orgId).toBe(ORG);
    expect(rows.map((r: { id: string }) => r.id)).toEqual(['v1']);
  });

  it('leaves stock rows alone when tracking did not change', async () => {
    const { service, inventoryLedger } = build([
      { id: 'v1', trackQuantity: true },
      { id: 'v2', trackQuantity: false },
    ]);

    await service.bulkUpdateVariants('p1', ORG, {
      updates: [
        { variantId: 'v1', trackQuantity: true },
        { variantId: 'v2', price: 10 },
      ],
    });

    expect(inventoryLedger.ensureStockRows).not.toHaveBeenCalled();
  });
});
