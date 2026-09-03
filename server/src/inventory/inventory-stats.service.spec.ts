import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationSettingsService } from '../organization-settings/organization-settings.service';
import { InventoryLedgerService } from './inventory-ledger.service';
import { WarehouseService } from './warehouse.service';
import { InventoryService } from './inventory.service';
import { INVENTORY_QUEUE } from './inventory.queue';
import { SHOPIFY_PUSH_QUEUE } from '../channel/shopify-push.queue';

/**
 * getStockStats feeds the four stat tiles on the inventory page. Those tiles
 * sit above a warehouse picker, so every figure has to narrow to the selected
 * warehouse — and the org predicate has to survive that narrowing, since it is
 * the only thing stopping a warehouse id from another org reading across the
 * tenant boundary. These tests pin the WHERE clauses, not the SQL.
 */
describe('InventoryService.getStockStats', () => {
  const ORG = 'org-1';
  const WH = 'wh-1';

  let service: InventoryService;
  let prisma: {
    organization: { findUnique: jest.Mock };
    stockLevel: { aggregate: jest.Mock; count: jest.Mock };
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ lowStockThreshold: 7 }),
      },
      stockLevel: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { available: 5, reserved: 3, qc: 2, damaged: 1 },
        }),
        count: jest.fn().mockResolvedValue(0),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ value: 1234 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrganizationSettingsService, useValue: {} },
        {
          provide: InventoryLedgerService,
          useValue: { isWarehousingEnabled: jest.fn().mockResolvedValue(true) },
        },
        { provide: WarehouseService, useValue: {} },
        { provide: getQueueToken(INVENTORY_QUEUE), useValue: {} },
        { provide: getQueueToken(SHOPIFY_PUSH_QUEUE), useValue: {} },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  const wheres = () => [
    prisma.stockLevel.aggregate.mock.calls[0][0].where,
    prisma.stockLevel.count.mock.calls[0][0].where,
    prisma.stockLevel.count.mock.calls[1][0].where,
  ];

  it('scopes every aggregate to the warehouse when one is given', async () => {
    await service.getStockStats(ORG, WH);

    for (const where of wheres()) {
      expect(where).toMatchObject({ organizationId: ORG, warehouseId: WH });
    }
  });

  it('keeps the org predicate alongside the warehouse, so a foreign warehouse id reads nothing', async () => {
    await service.getStockStats(ORG, 'wh-from-another-org');

    for (const where of wheres()) {
      // Without organizationId still present, this filter would be the only
      // thing between one tenant and another tenant's stock.
      expect(where.organizationId).toBe(ORG);
    }
  });

  it('omits the warehouse predicate entirely when none is given', async () => {
    await service.getStockStats(ORG);

    for (const where of wheres()) {
      expect(where.organizationId).toBe(ORG);
      expect(where).not.toHaveProperty('warehouseId');
    }
  });

  it('parameterises the warehouse into the stock-value SQL rather than inlining it', async () => {
    await service.getStockStats(ORG, WH);

    // The tagged template receives the warehouse as a bound value; asserting on
    // the values (not the SQL text) is what proves it is not concatenated in.
    const values = JSON.stringify(prisma.$queryRaw.mock.calls[0].slice(1));
    expect(values).toContain(WH);
    expect(values).toContain(ORG);
  });

  it('leaves the stock-value SQL unparameterised by warehouse when none is given', async () => {
    await service.getStockStats(ORG);

    const values = JSON.stringify(prisma.$queryRaw.mock.calls[0].slice(1));
    expect(values).toContain(ORG);
    expect(values).not.toContain(WH);
  });

  it('still returns the derived totals unchanged', async () => {
    prisma.stockLevel.count
      .mockResolvedValueOnce(4) // low
      .mockResolvedValueOnce(2); // oversold

    const stats = await service.getStockStats(ORG, WH);

    expect(stats).toMatchObject({
      unitsAvailable: 5,
      unitsReserved: 3,
      unitsQc: 2,
      unitsDamaged: 1,
      unitsOnHand: 11,
      lowStockLines: 4,
      oversoldLines: 2,
      stockValue: 1234,
      lowStockThreshold: 7,
    });
  });
});
