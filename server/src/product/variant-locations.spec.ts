import { BadRequestException } from '@nestjs/common';
import { ProductService } from './product.service';

/**
 * The product-side half of "Edit locations": remembering which Shopify
 * locations a variant was added to or taken out of, and flagging the product
 * for a sync.
 *
 * The CRM rows are the ledger's job (covered in the inventory specs); what is
 * pinned here is the bookkeeping the Shopify push later acts on.
 */
describe('ProductService.setVariantLocations', () => {
  const ORG = 'org_1';
  const VARIANT = 'v1';
  const PRODUCT = 'p1';

  type Change = { warehouseId: string; shopifyLocationId: string | null };

  function build(opts: {
    change: { added: Change[]; removed: Change[] };
    metadata?: Record<string, unknown>;
    warehousing?: boolean;
    trackQuantity?: boolean;
    trackGlobally?: boolean;
  }) {
    const metadata = opts.metadata ?? { shopifySync: { status: 'SYNCED' } };
    const tx = {
      // mutatePendingLocationChanges: locked read, then a key-level merge.
      $queryRaw: jest.fn().mockResolvedValue([{ metadata }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      // markOutOfSyncIfNeeded
      product: {
        findUnique: jest.fn().mockResolvedValue({ metadata }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
      productVariant: {
        findFirst: jest.fn().mockResolvedValue({
          id: VARIANT,
          trackQuantity: opts.trackQuantity ?? true,
          product: { id: PRODUCT, vendor: null, channel: { platform: 'SHOPIFY' } },
        }),
      },
    };
    const inventoryLedger = {
      isWarehousingEnabled: jest.fn().mockResolvedValue(opts.warehousing ?? true),
      setVariantLocations: jest.fn().mockResolvedValue(opts.change),
    };
    const settings = {
      getProductSettings: jest
        .fn()
        .mockResolvedValue({ trackQuantityGlobally: opts.trackGlobally ?? false }),
    };
    const service = new ProductService(
      prisma as never,
      {} as never,
      settings as never,
      inventoryLedger as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    /** The pending list written through the key-level merge, if any. */
    const pendingWritten = () => {
      const call = tx.$executeRaw.mock.calls.at(-1);
      if (!call) return undefined;
      const json = (call.slice(1) as unknown[]).find(
        (v) => typeof v === 'string' && v.startsWith('{'),
      ) as string;
      return JSON.parse(json).pendingLocationChanges;
    };
    const markedOutOfSync = () =>
      tx.product.update.mock.calls.some(
        (c) => c[0].data.metadata.shopifySync.status === 'OUT_OF_SYNC',
      );
    return { service, tx, inventoryLedger, pendingWritten, markedOutOfSync };
  }

  const run = (service: ProductService) =>
    service.setVariantLocations(VARIANT, ORG, { warehouseIds: ['wh_a'] });

  it('queues a removal at a Shopify location and marks the product out of sync', async () => {
    const { service, pendingWritten, markedOutOfSync } = build({
      change: { added: [], removed: [{ warehouseId: 'wh_shop', shopifyLocationId: '222' }] },
    });

    const res = await run(service);

    expect(pendingWritten()).toEqual([
      { variantId: VARIANT, warehouseId: 'wh_shop', shopifyLocationId: '222', action: 'remove' },
    ]);
    expect(markedOutOfSync()).toBe(true);
    expect(res).toEqual({ ok: true, added: 0, removed: 1, needsShopifySync: true });
  });

  it('queues an add at a Shopify location and marks the product out of sync', async () => {
    const { service, pendingWritten, markedOutOfSync } = build({
      change: { added: [{ warehouseId: 'wh_shop', shopifyLocationId: '222' }], removed: [] },
    });

    await run(service);

    expect(pendingWritten()).toEqual([
      { variantId: VARIANT, warehouseId: 'wh_shop', shopifyLocationId: '222', action: 'add' },
    ]);
    expect(markedOutOfSync()).toBe(true);
  });

  it('lets the latest edit replace what was queued for that location, and only that', async () => {
    const other = { variantId: 'v_other', warehouseId: 'wh_shop', shopifyLocationId: '222', action: 'remove' };
    const { service, pendingWritten } = build({
      change: { added: [{ warehouseId: 'wh_shop', shopifyLocationId: '222' }], removed: [] },
      metadata: {
        shopifySync: { status: 'OUT_OF_SYNC' },
        pendingLocationChanges: [
          { variantId: VARIANT, warehouseId: 'wh_shop', shopifyLocationId: '222', action: 'remove' },
          other,
        ],
      },
    });

    await run(service);

    expect(pendingWritten()).toEqual([
      other,
      { variantId: VARIANT, warehouseId: 'wh_shop', shopifyLocationId: '222', action: 'add' },
    ]);
  });

  it('leaves Shopify out of it when only CRM locations changed', async () => {
    const { service, tx, markedOutOfSync } = build({
      change: {
        added: [{ warehouseId: 'wh_new', shopifyLocationId: null }],
        removed: [{ warehouseId: 'wh_old', shopifyLocationId: null }],
      },
    });

    const res = await run(service);

    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(markedOutOfSync()).toBe(false);
    expect(res).toEqual({ ok: true, added: 1, removed: 1, needsShopifySync: false });
  });

  it('refuses for an org without warehousing, before touching anything', async () => {
    const { service, inventoryLedger } = build({
      change: { added: [], removed: [] },
      warehousing: false,
    });

    await expect(run(service)).rejects.toBeInstanceOf(BadRequestException);
    expect(inventoryLedger.setVariantLocations).not.toHaveBeenCalled();
  });

  it('refuses for a variant that does not track quantity', async () => {
    const { service, inventoryLedger } = build({
      change: { added: [], removed: [] },
      trackQuantity: false,
    });

    await expect(run(service)).rejects.toThrow(/does not track quantity/);
    expect(inventoryLedger.setVariantLocations).not.toHaveBeenCalled();
  });

  it('allows an untracked variant when the org tracks everything', async () => {
    const { service, inventoryLedger } = build({
      change: { added: [], removed: [] },
      trackQuantity: false,
      trackGlobally: true,
    });

    await run(service);
    expect(inventoryLedger.setVariantLocations).toHaveBeenCalled();
  });
});
