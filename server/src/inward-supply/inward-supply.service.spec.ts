import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InwardSupplyService } from './inward-supply.service';

/**
 * This decides how much input tax credit a merchant is told they can claim.
 *
 * The failure that matters is silent: treating an unstated GST amount as zero.
 * A foreign supplier invoice carrying no GST line means "we were not told", not
 * "there is no tax" — and summing it as zero produces a total that looks
 * complete while understating the claim, so nobody goes looking for the
 * missing figure. This is the same trap `extractRefundTax` exists to avoid on
 * the refund path.
 *
 * Every expected value below is computed by hand.
 */
describe('InwardSupplyService', () => {
  let service: InwardSupplyService;
  let prisma: {
    inwardSupply: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
  };

  const dec = (value: string) => new Prisma.Decimal(value);

  function row(overrides: Partial<{
    feeAmount: Prisma.Decimal;
    gstAmount: Prisma.Decimal | null;
    isReverseCharge: boolean;
  }> = {}) {
    return {
      supplier: 'Razorpay',
      feeAmount: dec('100.00'),
      gstAmount: dec('18.00'),
      isReverseCharge: false,
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      inwardSupply: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'f1' }),
        delete: jest.fn().mockResolvedValue({ id: 'f1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [InwardSupplyService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(InwardSupplyService);
  });

  const query = { financialYear: '2026-27', period: '09' };

  describe('summary', () => {
    it('adds up two gateways in one period', async () => {
      prisma.inwardSupply.findMany.mockResolvedValue([
        row({ feeAmount: dec('1000.00'), gstAmount: dec('180.00') }),
        row({ feeAmount: dec('500.00'), gstAmount: dec('90.00') }),
      ]);

      const { summary } = await service.list('org1', query);

      expect(summary.totalFee).toBe(1500);
      expect(summary.totalGst).toBe(270); // 180 + 90
      expect(summary.rowsWithUnknownGst).toBe(0);
    });

    it('does NOT count an unstated GST as zero', async () => {
      // The load-bearing case. The second row's tax is unknown, so the claim is
      // "at least 180", not "180" — and the caller has to be able to tell.
      prisma.inwardSupply.findMany.mockResolvedValue([
        row({ feeAmount: dec('1000.00'), gstAmount: dec('180.00') }),
        row({ feeAmount: dec('500.00'), gstAmount: null }),
      ]);

      const { summary } = await service.list('org1', query);

      expect(summary.totalGst).toBe(180);
      expect(summary.rowsWithUnknownGst).toBe(1); // marks the total incomplete
      expect(summary.totalFee).toBe(1500); // the fee itself is still known
    });

    it('reports null GST — not zero — when no row states one', async () => {
      // "We don't know" and "there is no tax to claim" must stay distinct, or
      // the UI shows a confident ₹0 for a figure nobody has supplied yet.
      prisma.inwardSupply.findMany.mockResolvedValue([
        row({ feeAmount: dec('750.00'), gstAmount: null }),
      ]);

      const { summary } = await service.list('org1', query);

      expect(summary.totalGst).toBeNull();
      expect(summary.rowsWithUnknownGst).toBe(1);
    });

    it('treats an explicit zero as a real answer', async () => {
      prisma.inwardSupply.findMany.mockResolvedValue([
        row({ feeAmount: dec('750.00'), gstAmount: dec('0.00') }),
      ]);

      const { summary } = await service.list('org1', query);

      expect(summary.totalGst).toBe(0);
      expect(summary.totalGst).not.toBeNull();
      expect(summary.rowsWithUnknownGst).toBe(0);
    });

    it('does not drift on values that lose precision as floats', async () => {
      // 0.10 + 0.20 is 0.30000000000000004 in float. Across a year of monthly
      // rows that drift compounds into a claim that does not tie to the
      // invoices behind it.
      prisma.inwardSupply.findMany.mockResolvedValue([
        row({ feeAmount: dec('0.10'), gstAmount: dec('0.10') }),
        row({ feeAmount: dec('0.20'), gstAmount: dec('0.20') }),
      ]);

      const { summary } = await service.list('org1', query);

      expect(summary.totalGst).toBe(0.3);
      expect(summary.totalFee).toBe(0.3);
    });

    it('separates the reverse-charge portion', async () => {
      // An import of services is self-paid first and reclaimed second. Both
      // legs are declarable and the first is the one people miss, so the
      // amount has to be visible on its own.
      prisma.inwardSupply.findMany.mockResolvedValue([
        row({ gstAmount: dec('180.00'), isReverseCharge: false }),
        row({ gstAmount: dec('90.00'), isReverseCharge: true }),
      ]);

      const { summary } = await service.list('org1', query);

      expect(summary.totalGst).toBe(270);
      expect(summary.reverseChargeGst).toBe(90);
    });

    it('returns zeroes for a period with no entries', async () => {
      const { summary } = await service.list('org1', query);

      expect(summary.totalFee).toBe(0);
      expect(summary.totalGst).toBeNull();
      expect(summary.rowsWithUnknownGst).toBe(0);
    });
  });

  describe('upsert', () => {
    it('keys on org, period and supplier so a re-entry corrects rather than doubles', async () => {
      await service.upsert('org1', {
        financialYear: '2026-27',
        period: '09',
        supplier: '  Razorpay  ',
        feeAmount: 1000,
        gstAmount: 180,
      });

      const call = prisma.inwardSupply.upsert.mock.calls[0][0];
      expect(call.where.organizationId_financialYear_period_supplier).toEqual({
        organizationId: 'org1',
        financialYear: '2026-27',
        period: '09',
        supplier: 'Razorpay', // trimmed, or " Razorpay" would be a second row
      });
    });

    it('clears a previously entered GST when the field is omitted', async () => {
      // `undefined` in a Prisma update means "leave alone". Omitting the tax
      // means the invoice does not state one, so it must overwrite an earlier
      // figure with null rather than quietly keep a stale number in the claim.
      await service.upsert('org1', {
        financialYear: '2026-27',
        period: '09',
        supplier: 'Shopify',
        feeAmount: 1000,
      });

      const call = prisma.inwardSupply.upsert.mock.calls[0][0];
      expect(call.update.gstAmount).toBeNull();
      expect(call.create.gstAmount).toBeNull();
    });

    it('normalises the supplier GSTIN to upper case', async () => {
      await service.upsert('org1', {
        financialYear: '2026-27',
        period: '09',
        supplier: 'Razorpay',
        feeAmount: 1000,
        supplierGstin: '29aabcu9603r1zm',
      });

      expect(
        prisma.inwardSupply.upsert.mock.calls[0][0].update.supplierGstin,
      ).toBe('29AABCU9603R1ZM');
    });
  });

  describe('remove', () => {
    it("refuses an id belonging to another organization", async () => {
      prisma.inwardSupply.findFirst.mockResolvedValue(null);

      await expect(service.remove('org1', 'someone-elses-id')).rejects.toThrow(
        /not found/i,
      );
      expect(prisma.inwardSupply.delete).not.toHaveBeenCalled();
    });

    it('deletes an entry the organization owns', async () => {
      prisma.inwardSupply.findFirst.mockResolvedValue({ id: 'f1' });

      await expect(service.remove('org1', 'f1')).resolves.toEqual({ id: 'f1' });
      expect(prisma.inwardSupply.delete).toHaveBeenCalledWith({
        where: { id: 'f1' },
      });
    });
  });
});
