import { InventoryLedgerService } from './inventory-ledger.service';
import { StockBucket } from '@prisma/client';

/**
 * `applyMovement` must take a row lock on the variant before touching anything.
 *
 * Two movements for ONE variant at DIFFERENT warehouses write different
 * stock_levels rows, so nothing else makes them block each other — and each
 * then recomputes `inventoryQuantity` from a snapshot missing the other, with
 * the last commit persisting a stale total. Production on 2026-09-04: SJ965
 * took +2 at Kochi and -2 at Main 55ms apart and kept a cached 22 against a
 * true SUM of 20. The lock is the only thing serialising them.
 */

const ORG = 'org_1';
const VARIANT = 'var_1';

function buildTx() {
  const calls: string[] = [];
  const tx: any = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      calls.push('lock:' + strings.join('?'));
      return Promise.resolve([{ '?column?': 1 }]);
    }),
    stockLevel: {
      findFirst: jest.fn(() => {
        calls.push('ensureLevel');
        return Promise.resolve({ id: 'lvl_1' });
      }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { available: 20 } }),
    },
    productVariant: {
      findUnique: jest.fn(() => {
        calls.push('readVariant');
        return Promise.resolve({ inventoryQuantity: 22, sku: 'SJ965' });
      }),
      update: jest.fn().mockResolvedValue(undefined),
    },
    inventoryEvent: { create: jest.fn().mockResolvedValue(undefined) },
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  };
  return { tx, calls };
}

describe('InventoryLedgerService.applyMovement locking', () => {
  const svc = new InventoryLedgerService({} as any, {} as any);

  it('locks the variant row before reading or writing anything', async () => {
    const { tx, calls } = buildTx();

    await svc.applyMovement(
      {
        orgId: ORG,
        variantId: VARIANT,
        warehouseId: 'wh_1',
        fromBucket: null,
        toBucket: StockBucket.AVAILABLE,
        quantity: 2,
        reason: 'webhook',
      },
      tx,
    );

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(calls[0]).toContain('lock:');
    expect(calls[0]).toContain('FOR UPDATE');
    // The lock must precede the level read and the variant read, or a
    // concurrent movement can still interleave between them.
    expect(calls.indexOf('ensureLevel')).toBeGreaterThan(0);
    expect(calls.indexOf('readVariant')).toBeGreaterThan(0);
  });

  it('recomputes the cache from stock_levels rather than incrementing it', async () => {
    const { tx } = buildTx();

    const res = await svc.applyMovement(
      {
        orgId: ORG,
        variantId: VARIANT,
        warehouseId: 'wh_1',
        fromBucket: null,
        toBucket: StockBucket.AVAILABLE,
        quantity: 2,
        reason: 'webhook',
      },
      tx,
    );

    // Cached said 22; the true SUM is 20. The recompute must win.
    expect(tx.productVariant.update).toHaveBeenCalledWith({
      where: { id: VARIANT },
      data: { inventoryQuantity: 20 },
    });
    expect(res.inventoryQuantity).toBe(20);
  });
});
