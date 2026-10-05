import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationSettingsService } from '../organization-settings/organization-settings.service';
import { InventoryLedgerService } from './inventory-ledger.service';

/**
 * The "Edit locations" dialog: which locations a variant is stocked at.
 *
 * What matters is that it only ever creates empty rows and removes empty rows
 * - it must never be a way to make stock disappear - and that it reports what
 * changed with each location's Shopify id, which is what the push acts on.
 */
describe('InventoryLedgerService.setVariantLocations', () => {
  let service: InventoryLedgerService;
  let db: {
    warehouse: { findMany: jest.Mock };
    stockLevel: { findMany: jest.Mock; createMany: jest.Mock; deleteMany: jest.Mock };
    $queryRaw: jest.Mock;
  };

  const ORG = 'org_1';
  const VARIANT = 'v1';

  const row = (
    warehouseId: string,
    over: Partial<{
      available: number;
      reserved: number;
      qc: number;
      damaged: number;
      isActive: boolean;
      shopifyLocationId: string | null;
    }> = {},
  ) => ({
    id: `row_${warehouseId}`,
    warehouseId,
    available: over.available ?? 0,
    reserved: over.reserved ?? 0,
    qc: over.qc ?? 0,
    damaged: over.damaged ?? 0,
    warehouse: {
      name: `Location ${warehouseId}`,
      isActive: over.isActive ?? true,
      shopifyLocationId: over.shopifyLocationId ?? null,
    },
  });

  const activeWarehouses = (...list: Array<[string, string | null]>) =>
    db.warehouse.findMany.mockResolvedValue(
      list.map(([id, shopifyLocationId]) => ({ id, shopifyLocationId })),
    );

  const run = (warehouseIds: string[]) =>
    service.setVariantLocations(db as never, ORG, VARIANT, warehouseIds);

  beforeEach(async () => {
    db = {
      warehouse: { findMany: jest.fn() },
      stockLevel: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryLedgerService,
        { provide: PrismaService, useValue: {} },
        { provide: OrganizationSettingsService, useValue: {} },
      ],
    }).compile();
    service = module.get(InventoryLedgerService);
  });

  it('adds an empty row for a newly chosen location and keeps the existing one', async () => {
    activeWarehouses(['wh_a', null], ['wh_b', '222']);
    db.stockLevel.findMany.mockResolvedValue([row('wh_a', { available: 5 })]);

    const res = await run(['wh_a', 'wh_b']);

    expect(db.stockLevel.createMany).toHaveBeenCalledWith({
      data: [{ organizationId: ORG, variantId: VARIANT, warehouseId: 'wh_b' }],
      skipDuplicates: true,
    });
    expect(db.stockLevel.deleteMany).not.toHaveBeenCalled();
    expect(res).toEqual({
      added: [{ warehouseId: 'wh_b', shopifyLocationId: '222' }],
      removed: [],
    });
  });

  it('removes the row of a dropped location that holds nothing, and reports its Shopify id', async () => {
    activeWarehouses(['wh_a', null]);
    db.stockLevel.findMany.mockResolvedValue([
      row('wh_a', { available: 5 }),
      row('wh_shop', { shopifyLocationId: '111' }),
    ]);

    const res = await run(['wh_a']);

    // The emptiness test rides in the delete itself, not only in the read.
    expect(db.stockLevel.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['row_wh_shop'] }, available: 0, reserved: 0, qc: 0, damaged: 0 },
    });
    expect(db.stockLevel.createMany).not.toHaveBeenCalled();
    expect(res).toEqual({
      added: [],
      removed: [{ warehouseId: 'wh_shop', shopifyLocationId: '111' }],
    });
  });

  it.each([['available'], ['reserved'], ['qc'], ['damaged']] as const)(
    'refuses to remove a location that still has %s stock, and writes nothing',
    async (bucket) => {
      activeWarehouses(['wh_a', null]);
      db.stockLevel.findMany.mockResolvedValue([row('wh_a'), row('wh_b', { [bucket]: 2 })]);

      await expect(run(['wh_a'])).rejects.toBeInstanceOf(ConflictException);
      expect(db.stockLevel.deleteMany).not.toHaveBeenCalled();
      expect(db.stockLevel.createMany).not.toHaveBeenCalled();
    },
  );

  it('takes the variant lock before reading, so a stock movement cannot slip in', async () => {
    activeWarehouses(['wh_a', null]);
    await run(['wh_a']);
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.stockLevel.findMany.mock.invocationCallOrder[0],
    );
  });

  it('refuses when a row it meant to remove was no longer empty at delete time', async () => {
    activeWarehouses(['wh_a', null]);
    db.stockLevel.findMany.mockResolvedValue([row('wh_a'), row('wh_b')]);
    db.stockLevel.deleteMany.mockResolvedValue({ count: 0 });

    await expect(run(['wh_a'])).rejects.toBeInstanceOf(ConflictException);
  });

  it('leaves a row at a deactivated location alone, stock or not', async () => {
    activeWarehouses(['wh_a', null]);
    db.stockLevel.findMany.mockResolvedValue([
      row('wh_a'),
      row('wh_old', { available: 3, isActive: false }),
    ]);

    const res = await run(['wh_a']);

    expect(db.stockLevel.deleteMany).not.toHaveBeenCalled();
    expect(res).toEqual({ added: [], removed: [] });
  });

  it('rejects a location that is not an active one of this org', async () => {
    activeWarehouses(['wh_a', null]); // wh_other was asked for but not found
    await expect(run(['wh_a', 'wh_other'])).rejects.toBeInstanceOf(NotFoundException);
    expect(db.stockLevel.findMany).not.toHaveBeenCalled();
  });

  it('treats a repeated id as one location', async () => {
    activeWarehouses(['wh_a', null]);
    const res = await run(['wh_a', 'wh_a']);
    expect(res.added).toEqual([{ warehouseId: 'wh_a', shopifyLocationId: null }]);
  });
});
