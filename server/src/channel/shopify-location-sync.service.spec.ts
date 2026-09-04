import { ShopifyLocationSyncService } from './shopify-location-sync.service';

/**
 * A variant Shopify stocks at quantity zero must still end up with a
 * `stock_levels` row.
 *
 * Why this is pinned: `applyMovement` -> `ensureLevel` used to be the only
 * code path that created a row, and the reconcile skipped it whenever the
 * delta was zero. Since `loadAvailable` read a missing row as 0, a variant
 * sitting at 0 in Shopify produced a zero delta forever and never got a row —
 * and `InventoryService.listStock` reads `stock_levels` only, so the variant
 * was absent from the inventory screen entirely rather than showing as out of
 * stock. Found in production on 2026-09-04: 351 variants with no row at all
 * and 2,840 missing their second-location row.
 */

const ORG = 'org_1';
const CHANNEL = 'ch_1';
const WAREHOUSE = 'wh_main';
const LOCATION = '73143058682';
const VARIANT = 'var_1';
const ITEM_ID = '55512345';

/** One page holding a single variant stocked at `available` in one location. */
function onePage(available: number) {
  return {
    productVariants: {
      nodes: [
        {
          inventoryItem: {
            id: `gid://shopify/InventoryItem/${ITEM_ID}`,
            inventoryLevels: {
              nodes: [
                {
                  location: { id: `gid://shopify/Location/${LOCATION}` },
                  quantities: [{ name: 'available', quantity: available }],
                },
              ],
              pageInfo: { hasNextPage: false },
            },
          },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
}

function build(available: number, existingRows: unknown[]) {
  const prisma = {
    warehouse: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: WAREHOUSE, shopifyLocationId: LOCATION }]),
    },
    productVariant: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: VARIANT, inventoryItemId: ITEM_ID }]),
    },
    stockLevel: {
      findMany: jest.fn().mockResolvedValue(existingRows),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    syncLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'log_1', cursor: null }),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
  const graphql = {
    request: jest.fn().mockResolvedValue(onePage(available)),
  };
  const ledger = { applyMovement: jest.fn().mockResolvedValue(undefined) };

  const service = new ShopifyLocationSyncService(
    prisma as any,
    graphql as any,
    {} as any,
    ledger as any,
  );
  return { service, prisma, ledger };
}

const getAuth = async () =>
  ({ token: 'tok', shopDomain: 'shop.myshopify.com' }) as any;

describe('ShopifyLocationSyncService.pullLocationInventory', () => {
  it('creates a zero row for a level Shopify stocks at 0 when we hold none', async () => {
    const { service, prisma, ledger } = build(0, []);

    await service.pullLocationInventory(CHANNEL, ORG, getAuth);

    expect(prisma.stockLevel.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.stockLevel.createMany).toHaveBeenCalledWith({
      data: [
        { organizationId: ORG, variantId: VARIANT, warehouseId: WAREHOUSE },
      ],
      skipDuplicates: true,
    });
    // Nothing moved: an empty bucket is not a stock movement, so no ledger
    // row and therefore no inventory_events entry.
    expect(ledger.applyMovement).not.toHaveBeenCalled();
  });

  it('does not re-create a row that already exists at zero', async () => {
    const { service, prisma, ledger } = build(0, [
      { variantId: VARIANT, warehouseId: WAREHOUSE, available: 0 },
    ]);

    await service.pullLocationInventory(CHANNEL, ORG, getAuth);

    expect(prisma.stockLevel.createMany).not.toHaveBeenCalled();
    expect(ledger.applyMovement).not.toHaveBeenCalled();
  });

  it('still applies a movement when the quantity actually differs', async () => {
    const { service, prisma, ledger } = build(5, [
      { variantId: VARIANT, warehouseId: WAREHOUSE, available: 2 },
    ]);

    await service.pullLocationInventory(CHANNEL, ORG, getAuth);

    expect(ledger.applyMovement).toHaveBeenCalledTimes(1);
    expect(ledger.applyMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG,
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 3,
      }),
    );
    // applyMovement -> ensureLevel creates the row itself in this path.
    expect(prisma.stockLevel.createMany).not.toHaveBeenCalled();
  });

  it('skips levels at locations with no mapped warehouse', async () => {
    const { service, prisma, ledger } = build(0, []);
    prisma.warehouse.findMany.mockResolvedValue([
      { id: 'wh_other', shopifyLocationId: '99999999' },
    ]);

    await service.pullLocationInventory(CHANNEL, ORG, getAuth);

    expect(prisma.stockLevel.createMany).not.toHaveBeenCalled();
    expect(ledger.applyMovement).not.toHaveBeenCalled();
  });
});
