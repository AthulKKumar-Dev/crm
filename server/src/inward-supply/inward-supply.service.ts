import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertInwardSupplyDto } from './dto/upsert-inward-supply.dto';
import { QueryInwardSuppliesDto } from './dto/query-inward-supplies.dto';

const ZERO = new Prisma.Decimal(0);

export interface InwardSupplySummary {
  totalFee: number;
  /**
   * GST across the rows that stated one. `null` when NO row did — there is
   * nothing to claim and nothing known, which is different from zero.
   */
  totalGst: number | null;
  /**
   * Rows whose GST was left unstated. While this is above zero the claim is
   * INCOMPLETE — `totalGst` is a floor, not the answer.
   */
  rowsWithUnknownGst: number;
  /** Subset of `totalGst` that must be self-paid first under reverse charge. */
  reverseChargeGst: number;
  /** Taxable value behind it — GSTR-3B 3.1(d) needs the value, not just the tax. */
  reverseChargeTaxable: number;
}

/**
 * Payment-supplier fees, and the input tax credit claimable on them.
 *
 * ⚠️ Nothing here touches a return total. A sale keeps its full declared value
 * however much the supplier deducts before settling — the fee is a SEPARATE
 * inward supply whose tax comes back as ITC. Netting fees off turnover would
 * under-declare revenue against figures the department cross-matches.
 *
 * Period-level rather than per-order because a third-party supplier's fee is
 * invisible to Shopify and arrives as a monthly statement.
 */
@Injectable()
export class InwardSupplyService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string, query: QueryInwardSuppliesDto) {
    const fees = await this.prisma.inwardSupply.findMany({
      where: {
        organizationId: orgId,
        financialYear: query.financialYear,
        period: query.period,
      },
      orderBy: { supplier: 'asc' },
    });

    return { fees, summary: this.summarise(fees) };
  }

  /**
   * Fold the period's rows.
   *
   * ⚠️ THE POINT OF THIS METHOD. An unstated GST amount must not be summed as
   * zero. Doing so produces a total that looks complete while understating a
   * tax claim — the same trap `extractRefundTax` exists to avoid on the refund
   * path. Unknowns are counted and surfaced instead, so the caller can say
   * "at least ₹X" rather than "₹X".
   *
   * Decimal throughout: these are money columns summed across rows, and float
   * addition drifts (0.10 + 0.20 = 0.30000000000000004).
   */
  private summarise(
    fees: Array<{
      feeAmount: Prisma.Decimal;
      gstAmount: Prisma.Decimal | null;
      isReverseCharge: boolean;
    }>,
  ): InwardSupplySummary {
    let totalFee = ZERO;
    let totalGst = ZERO;
    let reverseChargeGst = ZERO;
    let reverseChargeTaxable = ZERO;
    let known = 0;
    let rowsWithUnknownGst = 0;

    for (const fee of fees) {
      totalFee = totalFee.plus(fee.feeAmount);
      // Taxable value accrues even when the tax is unstated — 3.1(d) still has
      // to declare the value of the supply.
      if (fee.isReverseCharge) {
        reverseChargeTaxable = reverseChargeTaxable.plus(fee.feeAmount);
      }

      if (fee.gstAmount === null) {
        rowsWithUnknownGst += 1;
        continue;
      }

      known += 1;
      totalGst = totalGst.plus(fee.gstAmount);
      if (fee.isReverseCharge) {
        reverseChargeGst = reverseChargeGst.plus(fee.gstAmount);
      }
    }

    return {
      totalFee: totalFee.toNumber(),
      // Null, not 0, when nothing stated a figure — "we don't know" and
      // "there is no tax" must stay distinguishable on screen.
      totalGst: known === 0 ? null : totalGst.toNumber(),
      rowsWithUnknownGst,
      reverseChargeGst: reverseChargeGst.toNumber(),
      reverseChargeTaxable: reverseChargeTaxable.toNumber(),
    };
  }

  /**
   * Create or correct a supplier's figure for a period.
   *
   * Upsert on the unique key, so re-entering a month's Razorpay total corrects
   * it rather than adding a second row that would double the claim. `source`
   * stays MANUAL here; a future Shopify sync writes its own rows.
   */
  async upsert(orgId: string, dto: UpsertInwardSupplyDto) {
    const supplier = dto.supplier.trim();

    const data = {
      feeAmount: new Prisma.Decimal(dto.feeAmount),
      // undefined and null differ: `undefined` would leave an existing value
      // untouched on update, but an omitted GST means "not stated" and must
      // clear a previously entered figure rather than silently keep it.
      gstAmount: dto.gstAmount === undefined ? null : new Prisma.Decimal(dto.gstAmount),
      supplierGstin: dto.supplierGstin?.trim().toUpperCase() ?? null,
      isReverseCharge: dto.isReverseCharge ?? false,
      note: dto.note?.trim() || null,
    };

    return this.prisma.inwardSupply.upsert({
      where: {
        organizationId_financialYear_period_supplier: {
          organizationId: orgId,
          financialYear: dto.financialYear,
          period: dto.period,
          supplier,
        },
      },
      create: {
        organizationId: orgId,
        financialYear: dto.financialYear,
        period: dto.period,
        supplier,
        source: 'MANUAL',
        ...data,
      },
      update: data,
    });
  }

  async remove(orgId: string, id: string) {
    // Scoped delete, not deleteMany: an id from another tenant must 404 rather
    // than silently affect nothing and report success.
    const existing = await this.prisma.inwardSupply.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Payment fee entry not found.');

    await this.prisma.inwardSupply.delete({ where: { id } });
    return { id };
  }
}
