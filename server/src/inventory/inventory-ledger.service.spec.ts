import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { Prisma, StockBucket } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationSettingsService } from '../organization-settings/organization-settings.service';
import { InventoryLedgerService } from './inventory-ledger.service';

/**
 * Unit tests for the movement engine. The Prisma transaction client is mocked
 * — these tests pin the SEMANTICS (event-first ordering, idempotency skip,
 * insufficient-stock abort, cache recompute, delta math), not SQL.
 */
describe('InventoryLedgerService', () => {
  let service: InventoryLedgerService;

  const variant = { inventoryQuantity: 10, sku: 'SKU-1' };
  let tx: {
    stockLevel: {
      findFirst: jest.Mock;
      create: jest.Mock;
      aggregate: jest.Mock;
      deleteMany: jest.Mock;
    };
    productVariant: { findUnique: jest.Mock; update: jest.Mock };
    inventoryEvent: { create: jest.Mock; createMany: jest.Mock };
    $executeRawUnsafe: jest.Mock;
  };

  beforeEach(async () => {
    tx = {
      stockLevel: {
        findFirst: jest.fn().mockResolvedValue({ id: 'level1' }),
        create: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { available: 7 } }),
        deleteMany: jest.fn(),
      },
      productVariant: {
        findUnique: jest.fn().mockResolvedValue(variant),
        update: jest.fn().mockResolvedValue({ ...variant }),
      },
      inventoryEvent: { create: jest.fn().mockResolvedValue({}), createMany: jest.fn() },
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryLedgerService,
        { provide: PrismaService, useValue: {} },
        {
          provide: OrganizationSettingsService,
          useValue: {
            getInventorySettings: jest
              .fn()
              .mockResolvedValue({ warehousingEnabled: true }),
          },
        },
      ],
    }).compile();

    service = module.get(InventoryLedgerService);
  });

  const baseArgs = {
    orgId: 'org1',
    variantId: 'v1',
    warehouseId: 'w1',
    quantity: 3,
    reason: 'adjustment',
  };

  it('reserve (AVAILABLE→RESERVED): guards the source bucket and decrements the cache', async () => {
    const result = await service.applyMovement(
      { ...baseArgs, fromBucket: StockBucket.AVAILABLE, toBucket: StockBucket.RESERVED },
      tx as never,
    );

    // Conditional update guards available >= qty.
    const sql = tx.$executeRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain('"available" = "available" - $2');
    expect(sql).toContain('"reserved" = "reserved" + $2');
    expect(sql).toContain('"available" >= $2');

    // Ledger row: sellable delta -3, movedQty 3.
    const event = tx.inventoryEvent.create.mock.calls[0][0].data;
    expect(event.changeAmount).toBe(-3);
    expect(event.movedQty).toBe(3);
    expect(event.quantityBefore).toBe(10);
    expect(event.quantityAfter).toBe(7);

    // Cache recomputed from SUM(available).
    expect(result).toEqual({ skipped: false, inventoryQuantity: 7 });
    expect(tx.productVariant.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { inventoryQuantity: 7 },
    });
  });

  it('stock-in (NULL→AVAILABLE): no source guard, positive delta', async () => {
    await service.applyMovement(
      { ...baseArgs, fromBucket: null, toBucket: StockBucket.AVAILABLE },
      tx as never,
    );
    const sql = tx.$executeRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain('"available" = "available" + $2');
    expect(sql).not.toContain('>=');
    const event = tx.inventoryEvent.create.mock.calls[0][0].data;
    expect(event.changeAmount).toBe(3);
  });

  it('bucket-to-bucket transfer (QC→DAMAGED): zero sellable delta, cache untouched', async () => {
    await service.applyMovement(
      { ...baseArgs, fromBucket: StockBucket.QC, toBucket: StockBucket.DAMAGED },
      tx as never,
    );
    const event = tx.inventoryEvent.create.mock.calls[0][0].data;
    expect(event.changeAmount).toBe(0);
    expect(event.movedQty).toBe(3);
    // No available change → no cache recompute.
    expect(tx.productVariant.update).not.toHaveBeenCalled();
  });

  it('insufficient stock: 0-row update throws Conflict (tx aborts, ledger rolls back)', async () => {
    tx.$executeRawUnsafe.mockResolvedValue(0);
    await expect(
      service.applyMovement(
        { ...baseArgs, fromBucket: StockBucket.AVAILABLE, toBucket: null },
        tx as never,
      ),
    ).rejects.toThrow(ConflictException);
    // Event insert DID run first — transactional rollback is what unwinds it.
    expect(tx.inventoryEvent.create).toHaveBeenCalled();
  });

  it('allowNegativeAvailable drops the availability guard (Shopify mirror path)', async () => {
    await service.applyMovement(
      {
        ...baseArgs,
        fromBucket: StockBucket.AVAILABLE,
        toBucket: StockBucket.RESERVED,
        allowNegativeAvailable: true,
      },
      tx as never,
    );
    const sql = tx.$executeRawUnsafe.mock.calls[0][0] as string;
    expect(sql).not.toContain('"available" >= $2');
  });

  it('duplicate idempotency key skips the movement entirely', async () => {
    tx.inventoryEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const result = await service.applyMovement(
      {
        ...baseArgs,
        fromBucket: StockBucket.AVAILABLE,
        toBucket: StockBucket.RESERVED,
        idempotencyKey: 'shopify:order:1:reserve',
      },
      tx as never,
    );
    expect(result).toEqual({ skipped: true, inventoryQuantity: 10 });
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('a P2002 without an idempotency key still throws', async () => {
    tx.inventoryEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.applyMovement(
        { ...baseArgs, fromBucket: StockBucket.AVAILABLE, toBucket: StockBucket.RESERVED },
        tx as never,
      ),
    ).rejects.toThrow();
  });

  it('rejects zero/negative quantities and same-bucket movements', async () => {
    await expect(
      service.applyMovement(
        { ...baseArgs, quantity: 0, fromBucket: null, toBucket: StockBucket.AVAILABLE },
        tx as never,
      ),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.applyMovement(
        { ...baseArgs, fromBucket: StockBucket.QC, toBucket: StockBucket.QC },
        tx as never,
      ),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.applyMovement(
        { ...baseArgs, fromBucket: null, toBucket: null },
        tx as never,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('recordQuantityChange is a no-op when nothing changed', async () => {
    await service.recordQuantityChange(tx as never, {
      orgId: 'org1',
      variantId: 'v1',
      quantityBefore: 5,
      quantityAfter: 5,
      reason: 'adjustment',
    });
    expect(tx.inventoryEvent.create).not.toHaveBeenCalled();
  });

  it('recordInitialQuantities skips zero-quantity variants', async () => {
    await service.recordInitialQuantities(
      tx as never,
      'org1',
      [
        { id: 'a', sku: 'A', inventoryQuantity: 0 },
        { id: 'b', sku: 'B', inventoryQuantity: 4 },
      ],
      'initial',
    );
    const rows = tx.inventoryEvent.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ variantId: 'b', changeAmount: 4, quantityBefore: 0 });
  });

  it('releaseStockRowsForDelete refuses when any bucket is non-zero', async () => {
    tx.stockLevel.findFirst.mockResolvedValue({ id: 'level1' });
    await expect(service.releaseStockRowsForDelete(tx as never, 'v1')).rejects.toThrow(
      ConflictException,
    );
    tx.stockLevel.findFirst.mockResolvedValue(null);
    await service.releaseStockRowsForDelete(tx as never, 'v1');
    expect(tx.stockLevel.deleteMany).toHaveBeenCalledWith({ where: { variantId: 'v1' } });
  });
});
