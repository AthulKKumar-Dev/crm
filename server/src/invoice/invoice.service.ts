import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  GstType,
  InvoiceStatus,
  OrderFinancialStatus,
  Prisma,
} from '@prisma/client';
import {
  retryOnNumberingConflict,
  uniqueViolationTargets,
} from '../common/utils/serialization-retry.util';
import { PrismaService } from '../prisma/prisma.service';
import { GstService } from '../gst/gst.service';
import {
  GstCalculatorService,
  GstCalculationResult,
} from '../gst/gst-calculator.service';
import { getStateName, isValidStateCode } from '../gst/constants/indian-states';
import {
  extractStateFromAddress,
  resolvePlaceOfSupply,
} from '../gst/place-of-supply.util';
import {
  getFinancialYear,
  gstPeriodRange,
  INDIA_TZ,
  resolveGstTimeZone,
  zonedDayEndExclusive,
  zonedDayStart,
  zonedParts,
} from '../common/utils/zoned-date.util';

/**
 * Hard ceiling on rows an export may materialise. Exports build the whole
 * result set in memory before serialising, so an unbounded query on a large
 * tenant is an out-of-memory risk for every tenant on the instance.
 */
const EXPORT_ROW_CAP = 10_000;

/**
 * Organizations already warned about running GST on an untouched UTC timezone.
 * Process-local and deliberately unbounded-in-practice (one entry per org) —
 * the point is to surface the misconfiguration once, not once per invoice.
 */
const gstTimeZoneFallbackWarned = new Set<string>();

/**
 * Order payment states that leave money outstanding on an issued invoice.
 * `REFUNDED` and `VOIDED` are deliberately absent — nothing is owed on either,
 * so neither should count towards "Outstanding".
 */
const OUTSTANDING_FINANCIAL_STATES: OrderFinancialStatus[] = [
  OrderFinancialStatus.PENDING,
  OrderFinancialStatus.AUTHORIZED,
  OrderFinancialStatus.PARTIALLY_PAID,
];
import { TaxResolverService } from '../gst/tax-resolver.service';
import { InvoiceNumberService } from './invoice-number.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { QueryGstReturnDto, GstReturnType } from './dto/query-gst-return.dto';
import { QueryInvoiceStatsDto } from './dto/query-invoice-stats.dto';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gstService: GstService,
    private readonly calculator: GstCalculatorService,
    private readonly taxResolver: TaxResolverService,
    private readonly invoiceNumber: InvoiceNumberService,
  ) {}

  // ─── GENERATE INVOICE ───
  // Creates a GST-compliant invoice for an order.
  // Snapshots all seller/buyer data at creation time.
  // Serializable + bounded retry: invoice numbers are read-max-then-increment,
  // so two concurrent requests can compute the same number. The loser's
  // transaction rolls back (consuming no number — the sequence stays gapless)
  // and the retry re-reads the new max.
  async create(orgId: string, dto: CreateInvoiceDto) {
    return retryOnNumberingConflict(
      () =>
        this.prisma.$transaction(
          (tx) => this.createForOrderTx(tx, orgId, dto.orderId, dto),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 10000,
          },
        ),
      {
        isRetriableUniqueViolation: (e) =>
          uniqueViolationTargets(e, 'invoiceNumber'),
        onRetry: (attempt) =>
          this.logger.warn(
            `Invoice number collision on attempt ${attempt} — retrying`,
          ),
      },
    );
  }

  /**
   * Transaction-scoped invoice creation. Used by:
   *   - the public `create()` (which opens its own tx)
   *   - the offline-order flow (which already holds an outer tx)
   *
   * Caller is responsible for verifying the org owns the order. We re-validate
   * defensively here to keep this safe to expose.
   */
  async createForOrderTx(
    tx: Prisma.TransactionClient,
    orgId: string,
    orderId: string,
    dto: {
      sellerGstinId?: string;
      buyerGstin?: string;
      placeOfSupplyCode?: string;
      notes?: string;
    },
  ) {
    // 1. Fetch the order with line items and customer
    const order = await tx.order.findFirst({
      // deletedAt filter matches every other order read path — without it a
      // soft-deleted order could still be issued a fresh, numbered, statutory
      // invoice.
      where: { id: orderId, organizationId: orgId, deletedAt: null },
      include: {
        lineItems: {
          include: {
            variant: {
              include: { product: { select: { id: true, hsnCode: true, gstRate: true } } },
            },
          },
        },
        customer: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // 1b. One live invoice per order. Friendly guard for the common case; the
    // partial unique index invoices_order_id_active_key backstops the race
    // where two requests pass this check simultaneously (loser gets P2002 →
    // 409 via the global filter). Cancelled invoices don't count — cancel-
    // then-reissue is the statutory correction flow.
    const existingInvoice = await tx.invoice.findFirst({
      where: { orderId, status: { not: InvoiceStatus.CANCELLED } },
      select: { invoiceNumber: true },
    });
    if (existingInvoice) {
      throw new ConflictException(
        `Invoice ${existingInvoice.invoiceNumber} already exists for this order. Cancel it first to issue a corrected one.`,
      );
    }

    // 2. Check if GST is enabled for the org. `timezone` is needed for the
    //    financial-year stamp below — servers run UTC, so deriving the FY in
    //    server-local time files a 00:30 IST sale on 1 April into the PREVIOUS
    //    financial year and burns a serial from that (possibly filed) year.
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { gstEnabled: true, timezone: true },
    });

    if (!org?.gstEnabled) {
      throw new BadRequestException(
        'GST is not enabled for this organization. Enable it in Settings → Tax & GST.',
      );
    }

    // 3. Determine the seller GSTIN
    let sellerGstin;
    if (dto.sellerGstinId) {
      sellerGstin = await tx.organizationGstin.findFirst({
        where: { id: dto.sellerGstinId, organizationId: orgId },
      });
    } else {
      // Auto-select: try matching place of supply first, then default
      const placeOfSupply = this.resolvePlaceOfSupply(dto, order);
      sellerGstin = await tx.organizationGstin.findFirst({
        where: { organizationId: orgId, stateCode: placeOfSupply, isActive: true },
      });
      if (!sellerGstin) {
        sellerGstin = await tx.organizationGstin.findFirst({
          where: { organizationId: orgId, isDefault: true, isActive: true },
        });
      }
    }

    if (!sellerGstin) {
      throw new BadRequestException(
        'No GSTIN registration found. Please add a GSTIN in Settings → Tax & GST.',
      );
    }

    // 4. Determine place of supply. Prefers the code the order was taxed with;
    //    the seller's state is the over-the-counter fallback for walk-ins.
    const placeOfSupplyCode = this.resolvePlaceOfSupply(
      dto,
      order,
      sellerGstin.stateCode,
    );
    const placeOfSupplyName =
      getStateName(placeOfSupplyCode) || placeOfSupplyCode;

    // 5. Determine GST type (intra vs inter state)
    const isIntraState = this.calculator.isIntraState(
      sellerGstin.stateCode,
      placeOfSupplyCode,
    );
    const gstType = isIntraState ? GstType.CGST_SGST : GstType.IGST;

    // 6. Calculate tax for each line item
    const lineItemResults: Array<{
      orderLineItem: (typeof order.lineItems)[0];
      calculation: GstCalculationResult;
      hsnCode: string;
    }> = [];

    for (const item of order.lineItems) {
      // Use TaxResolver priority chain: Product > Collection > State > 0%
      // toNullableNumber preserves the null (unset) vs 0 (explicitly exempt)
      // distinction that the resolver's priority chain depends on.
      const productGstRate = this.calculator.toNullableNumber(
        item.variant?.product?.gstRate,
      );
      const productId = item.variant?.product?.id ?? null;
      const gstRate = await this.taxResolver.resolveGstRate(
        orgId,
        productId,
        productGstRate,
        placeOfSupplyCode,
      );
      const hsnCode = item.variant?.product?.hsnCode || '0000';

      const calculation = this.calculator.calculateLineItem(
        {
          unitPrice: this.calculator.toNumber(item.price),
          quantity: item.quantity,
          discount: this.calculator.toNumber(item.totalDiscount),
          gstRate,
        },
        isIntraState,
      );

      lineItemResults.push({ orderLineItem: item, calculation, hsnCode });
    }

    // 7. Calculate invoice totals.
    //    The discount reported is the sum of the discounts ACTUALLY applied to
    //    these lines — each is already subtracted inside `taxableValue`, so it
    //    must not be deducted again. Using `order.totalDiscounts` here would
    //    print 0.00 on every offline invoice (that column is hardcoded 0) and
    //    would double-count on Shopify orders (it already includes the per-line
    //    allocations). Shipping is carried through so the invoice total agrees
    //    with the order total.
    const calculations = lineItemResults.map((r) => r.calculation);
    const appliedDiscount = this.calculator.round2(
      lineItemResults.reduce(
        (sum, r) => sum + this.calculator.toNumber(r.orderLineItem.totalDiscount),
        0,
      ),
    );
    const totals = this.calculator.calculateInvoiceTotals(
      calculations,
      appliedDiscount,
      this.calculator.toNumber(order.totalShippingPrice),
    );

    // 8. Generate invoice number (passes the same tx so it's atomic with the create below)
    const invoiceDate = new Date();
    const financialYear = this.calculator.getFinancialYear(
      invoiceDate,
      this.gstTimeZone(orgId, org),
    );
    const invoiceNum = await this.invoiceNumber.getNextInvoiceNumber(
      orgId,
      financialYear,
      tx,
    );

    // 9. Resolve buyer info
    const buyerGstin = dto.buyerGstin || order.customer?.gstin || null;
    const buyerName = order.customer
      ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim()
      : 'Guest Customer';
    const buyerStateCode =
      this.extractStateFromAddress(order.billingAddress) ||
      order.customer?.billingStateCode ||
      placeOfSupplyCode;
    const buyerStateName = getStateName(buyerStateCode) || buyerStateCode;

    // 10. Create the invoice with line items
    const invoice = await tx.invoice.create({
      data: {
        organizationId: orgId,
        orderId: order.id,
        sellerGstinId: sellerGstin.id,
        invoiceNumber: invoiceNum,
        invoiceDate,
        financialYear,
        // Seller snapshot
        sellerGstin: sellerGstin.gstin,
        sellerLegalName: sellerGstin.legalName,
        sellerAddress: sellerGstin.address ?? undefined,
        sellerStateCode: sellerGstin.stateCode,
        sellerStateName: sellerGstin.stateName,
        // Buyer snapshot
        buyerName,
        buyerGstin,
        buyerAddress: order.billingAddress ?? undefined,
        buyerStateCode,
        buyerStateName,
        // Place of supply
        placeOfSupply: placeOfSupplyCode,
        placeOfSupplyName,
        gstType,
        // Totals
        subtotal: totals.subtotal,
        totalCgst: totals.totalCgst,
        totalSgst: totals.totalSgst,
        totalIgst: totals.totalIgst,
        totalTax: totals.totalTax,
        totalDiscount: totals.totalDiscount,
        grandTotal: totals.grandTotal,
        currency: order.currency,
        notes: dto.notes,
        // Line items
        lineItems: {
          create: lineItemResults.map((r) => ({
            orderLineItemId: r.orderLineItem.id,
            description: r.orderLineItem.variantTitle
              ? `${r.orderLineItem.title} - ${r.orderLineItem.variantTitle}`
              : r.orderLineItem.title,
            hsnCode: r.hsnCode,
            quantity: r.orderLineItem.quantity,
            // The gross per-unit price. (This previously read as
            // `taxable/qty + taxable === 0 ? 0 : price` — `+` and `===` bind
            // tighter than `?:`, so the division was computed and discarded and
            // a fully-discounted line was written with unitPrice 0 while
            // `discount` still held the full amount, breaking the row's own
            // invariant taxableValue = unitPrice*qty - discount.)
            unitPrice: this.calculator.toNumber(r.orderLineItem.price),
            discount: this.calculator.toNumber(r.orderLineItem.totalDiscount),
            taxableValue: r.calculation.taxableValue,
            gstRate: r.calculation.gstRate,
            cgstRate: r.calculation.cgstRate,
            cgstAmount: r.calculation.cgstAmount,
            sgstRate: r.calculation.sgstRate,
            sgstAmount: r.calculation.sgstAmount,
            igstRate: r.calculation.igstRate,
            igstAmount: r.calculation.igstAmount,
            totalTax: r.calculation.totalTax,
            totalAmount: r.calculation.totalAmount,
          })),
        },
      },
      include: { lineItems: true },
    });

    return invoice;
  }

  // ─── LIST INVOICES ───
  async findAll(orgId: string, query: QueryInvoicesDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    // Date filters name calendar days in the merchant's timezone, so resolve it
    // the same way the statutory date math does — otherwise the list disagrees
    // with the GST return sitting next to it.
    const timeZone =
      query.dateFrom || query.dateTo
        ? this.gstTimeZone(
            orgId,
            await this.prisma.organization.findUnique({
              where: { id: orgId },
              select: { timezone: true, gstEnabled: true },
            }),
          )
        : 'UTC';

    const where: any = {
      organizationId: orgId,
      ...(query.financialYear && { financialYear: query.financialYear }),
      ...(query.status && { status: query.status }),
      ...(query.sellerGstinId && { sellerGstinId: query.sellerGstinId }),
      // B2B/B2C is not a stored column — a buyer is registered exactly when the
      // invoice captured a GSTIN for them.
      ...(query.buyerType === 'B2B' && { buyerGstin: { not: null } }),
      ...(query.buyerType === 'B2C' && { buyerGstin: null }),
      // "Unpaid" means issued AND the order still owes. The status is pinned
      // here rather than left to `query.status` so the filter cannot be
      // combined into something self-contradictory (a cancelled-but-unpaid
      // invoice is not a thing the UI should be able to ask for).
      ...(query.paymentState === 'UNPAID' && {
        status: InvoiceStatus.ISSUED,
        order: { financialStatus: { in: OUTSTANDING_FINANCIAL_STATES } },
      }),
      ...(query.search && {
        OR: [
          { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
          { buyerName: { contains: query.search, mode: 'insensitive' } },
          { buyerGstin: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      // `lt` on an exclusive next-day bound, not `lte` on the day itself: a
      // bare "2026-04-30" parsed as an instant is that day's FIRST moment, so
      // an inclusive bound excluded almost the whole day the user asked for.
      ...(query.dateFrom || query.dateTo
        ? {
            invoiceDate: {
              ...(query.dateFrom && {
                gte: zonedDayStart(query.dateFrom, timeZone),
              }),
              ...(query.dateTo && {
                lt: zonedDayEndExclusive(query.dateTo, timeZone),
              }),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { invoiceDate: 'desc' },
        include: {
          // `financialStatus` backs the derived "Unpaid" pill in the list — the
          // invoice itself has no payment state.
          order: {
            select: { name: true, orderNumber: true, financialStatus: true },
          },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── GET SINGLE INVOICE ───
  async findOne(id: string, orgId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId: orgId },
      include: {
        lineItems: true,
        order: {
          select: { name: true, orderNumber: true, financialStatus: true },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  // ─── CANCEL INVOICE ───
  async cancel(id: string, orgId: string) {
    const invoice = await this.findOne(id, orgId);

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new ConflictException('Invoice is already cancelled');
    }

    return this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });
  }

  // ─── GST RETURN SUMMARY ───
  async getGstReturn(orgId: string, query: QueryGstReturnDto) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { timezone: true, gstEnabled: true },
    });

    // Period boundaries are anchored to the merchant's timezone. On a UTC
    // server, naive local-time math shifted every month/quarter edge by the
    // offset — for IST that meant sales in the first 5.5 hours of a month were
    // missing from its return, and sales in the first 5.5 hours of the NEXT
    // month were reported inside it.
    const dateRange = this.getDateRangeForPeriod(
      query.financialYear,
      query.period,
      this.gstTimeZone(orgId, org),
    );

    const where: any = {
      organizationId: orgId,
      financialYear: query.financialYear,
      status: InvoiceStatus.ISSUED,
      invoiceDate: {
        gte: dateRange.from,
        // Half-open. The previous inclusive `23:59:59` bound carried no
        // milliseconds, so an invoice at 23:59:59.500 was silently dropped.
        lt: dateRange.toExclusive,
      },
      ...(query.sellerGstinId && { sellerGstinId: query.sellerGstinId }),
    };

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: { lineItems: true },
      // Bounded — this hydrates every line item of every invoice in the period.
      take: EXPORT_ROW_CAP,
    });

    if (query.returnType === GstReturnType.GSTR3B) {
      return this.generateGstr3B(invoices);
    }

    return this.generateGstr1(invoices);
  }

  /**
   * Aggregates for the invoice KPI row and the filter-chip counts.
   *
   * The chips must count the whole set rather than the current page, so this
   * cannot be derived from `findAll`'s response.
   *
   * Month boundaries go through `gstPeriodRange` in the merchant's timezone for
   * the reason documented on `getGstReturn`: naive local-time month maths on a
   * UTC server shifts every edge by the offset, which for IST silently moved
   * the first 5.5 hours of each month into the wrong one.
   */
  async getStats(orgId: string, query: QueryInvoiceStatsDto) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { timezone: true, gstEnabled: true, currency: true },
    });

    const timeZone = this.gstTimeZone(orgId, org);
    const now = new Date();

    const currentMonth = gstPeriodRange(
      getFinancialYear(now, timeZone),
      String(zonedParts(now, timeZone).month).padStart(2, '0'),
      timeZone,
    );

    // One millisecond before this month began is always inside the previous
    // month, so this needs no special case for January.
    const lastInstantOfPrevMonth = new Date(currentMonth.from.getTime() - 1);
    const previousMonth = gstPeriodRange(
      getFinancialYear(lastInstantOfPrevMonth, timeZone),
      String(zonedParts(lastInstantOfPrevMonth, timeZone).month).padStart(2, '0'),
      timeZone,
    );

    // Counts are scoped to the financial year the list is showing; the
    // month-to-date money figures are not, since they are always "this month".
    const scope: Prisma.InvoiceWhereInput = {
      organizationId: orgId,
      ...(query.financialYear && { financialYear: query.financialYear }),
      ...(query.sellerGstinId && { sellerGstinId: query.sellerGstinId }),
    };

    const issuedInMonth = (range: { from: Date; toExclusive: Date }) => ({
      organizationId: orgId,
      ...(query.sellerGstinId && { sellerGstinId: query.sellerGstinId }),
      status: InvoiceStatus.ISSUED,
      invoiceDate: { gte: range.from, lt: range.toExclusive },
    });

    const outstandingWhere: Prisma.InvoiceWhereInput = {
      ...scope,
      status: InvoiceStatus.ISSUED,
      order: { financialStatus: { in: OUTSTANDING_FINANCIAL_STATES } },
    };

    const [
      thisMonth,
      lastMonth,
      outstanding,
      all,
      issued,
      draft,
      cancelled,
      b2b,
      unpaid,
    ] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: issuedInMonth(currentMonth),
        _sum: { grandTotal: true, totalTax: true },
      }),
      this.prisma.invoice.aggregate({
        where: issuedInMonth(previousMonth),
        _sum: { grandTotal: true, totalTax: true },
      }),
      this.prisma.invoice.aggregate({
        where: outstandingWhere,
        _sum: { grandTotal: true },
      }),
      this.prisma.invoice.count({ where: scope }),
      this.prisma.invoice.count({
        where: { ...scope, status: InvoiceStatus.ISSUED },
      }),
      this.prisma.invoice.count({
        where: { ...scope, status: InvoiceStatus.DRAFT },
      }),
      this.prisma.invoice.count({
        where: { ...scope, status: InvoiceStatus.CANCELLED },
      }),
      this.prisma.invoice.count({
        where: { ...scope, buyerGstin: { not: null } },
      }),
      this.prisma.invoice.count({ where: outstandingWhere }),
    ]);

    const decimal = (value: Prisma.Decimal | null | undefined) =>
      value ? Math.round(parseFloat(value.toString()) * 100) / 100 : 0;

    const invoicedNow = decimal(thisMonth._sum.grandTotal);
    const invoicedPrev = decimal(lastMonth._sum.grandTotal);
    const taxNow = decimal(thisMonth._sum.totalTax);
    const taxPrev = decimal(lastMonth._sum.totalTax);

    return {
      invoicedThisMonth: {
        amount: invoicedNow,
        changePct: this.percentChange(invoicedNow, invoicedPrev),
      },
      taxCollected: {
        amount: taxNow,
        changePct: this.percentChange(taxNow, taxPrev),
      },
      outstanding: {
        amount: decimal(outstanding._sum.grandTotal),
        invoiceCount: unpaid,
        // Outstanding is a running balance, not a monthly flow. Reporting a
        // month-over-month delta would need a historical snapshot of what was
        // owed at the end of last month, which nothing records — so this is
        // null and the card omits its trend badge rather than inventing one.
        changePct: null,
      },
      periodStart: currentMonth.from.toISOString(),
      periodEnd: now.toISOString(),
      counts: { all, issued, unpaid, b2b, draft, cancelled },
      currency: org?.currency ?? 'INR',
    };
  }

  /**
   * Percentage change, rounded. Null when there is no prior basis: a jump from
   * zero is not "100% up", and passing 0 would render a green up-trend badge.
   */
  private percentChange(current: number, previous: number): number | null {
    if (!previous) return null;
    return Math.round(((current - previous) / previous) * 100);
  }

  // ─── GSTR-1: DETAILED SALES RETURN ───
  private generateGstr1(invoices: any[]) {
    // B2B: Invoices where buyerGstin is present
    const b2bInvoices = invoices.filter((inv) => inv.buyerGstin);
    const b2cInvoices = invoices.filter((inv) => !inv.buyerGstin);

    // Group B2B by buyer GSTIN
    const b2bGrouped = new Map<string, any[]>();
    for (const inv of b2bInvoices) {
      const key = inv.buyerGstin;
      if (!b2bGrouped.has(key)) b2bGrouped.set(key, []);
      b2bGrouped.get(key)!.push(inv);
    }

    const b2b = Array.from(b2bGrouped.entries()).map(([gstin, invs]) => ({
      buyerGstin: gstin,
      buyerName: invs[0].buyerName,
      invoiceCount: invs.length,
      invoices: invs.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        gstType: inv.gstType,
        subtotal: inv.subtotal,
        cgst: inv.totalCgst,
        sgst: inv.totalSgst,
        igst: inv.totalIgst,
        totalTax: inv.totalTax,
        grandTotal: inv.grandTotal,
      })),
      totalTaxable: this.sumField(invs, 'subtotal'),
      totalTax: this.sumField(invs, 'totalTax'),
    }));

    // B2C: Group by place of supply
    const b2cGrouped = new Map<string, any[]>();
    for (const inv of b2cInvoices) {
      const key = inv.placeOfSupply;
      if (!b2cGrouped.has(key)) b2cGrouped.set(key, []);
      b2cGrouped.get(key)!.push(inv);
    }

    const b2cSummary = Array.from(b2cGrouped.entries()).map(
      ([stateCode, invs]) => ({
        placeOfSupply: stateCode,
        placeOfSupplyName: invs[0].placeOfSupplyName,
        invoiceCount: invs.length,
        totalTaxable: this.sumField(invs, 'subtotal'),
        totalCgst: this.sumField(invs, 'totalCgst'),
        totalSgst: this.sumField(invs, 'totalSgst'),
        totalIgst: this.sumField(invs, 'totalIgst'),
        totalTax: this.sumField(invs, 'totalTax'),
      }),
    );

    // HSN Summary: Group all line items by HSN code
    const hsnMap = new Map<
      string,
      { hsnCode: string; quantity: number; taxable: number; tax: number }
    >();
    for (const inv of invoices) {
      for (const item of inv.lineItems) {
        const existing = hsnMap.get(item.hsnCode) || {
          hsnCode: item.hsnCode,
          quantity: 0,
          taxable: 0,
          tax: 0,
        };
        existing.quantity += item.quantity;
        existing.taxable += parseFloat(item.taxableValue.toString());
        existing.tax += parseFloat(item.totalTax.toString());
        hsnMap.set(item.hsnCode, existing);
      }
    }

    const hsnSummary = Array.from(hsnMap.values());

    // Overall totals
    const totals = {
      totalTaxable: this.sumField(invoices, 'subtotal'),
      totalCgst: this.sumField(invoices, 'totalCgst'),
      totalSgst: this.sumField(invoices, 'totalSgst'),
      totalIgst: this.sumField(invoices, 'totalIgst'),
      totalTax: this.sumField(invoices, 'totalTax'),
      totalInvoices: invoices.length,
    };

    return { b2b, b2cSummary, hsnSummary, totals };
  }

  // ─── GSTR-3B: SUMMARY RETURN ───
  private generateGstr3B(invoices: any[]) {
    // Group by GST rate
    const rateMap = new Map<
      number,
      { taxable: number; cgst: number; sgst: number; igst: number }
    >();

    for (const inv of invoices) {
      for (const item of inv.lineItems) {
        const rate = parseFloat(item.gstRate.toString());
        const existing = rateMap.get(rate) || {
          taxable: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
        };
        existing.taxable += parseFloat(item.taxableValue.toString());
        existing.cgst += parseFloat(item.cgstAmount.toString());
        existing.sgst += parseFloat(item.sgstAmount.toString());
        existing.igst += parseFloat(item.igstAmount.toString());
        rateMap.set(rate, existing);
      }
    }

    const outwardSupplies = Array.from(rateMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([rate, data]) => ({
        gstRate: rate,
        taxableValue: Math.round(data.taxable * 100) / 100,
        cgst: Math.round(data.cgst * 100) / 100,
        sgst: Math.round(data.sgst * 100) / 100,
        igst: Math.round(data.igst * 100) / 100,
        totalTax:
          Math.round((data.cgst + data.sgst + data.igst) * 100) / 100,
      }));

    // Inter-state summary
    const interStateInvoices = invoices.filter(
      (inv) => inv.gstType === GstType.IGST,
    );
    // Table 3.2 is inter-state supplies to *unregistered* persons, so it is
    // narrower than the aggregate above (which spans every IGST invoice, B2B
    // included). The aggregate keeps its existing meaning because the CSV
    // exporter reads it.
    const byStateMap = new Map<
      string,
      { name: string; invoiceCount: number; taxable: number; igst: number }
    >();

    for (const inv of interStateInvoices) {
      if (inv.buyerGstin) continue; // registered buyer — not a 3.2 row

      const code = inv.placeOfSupply;
      const existing = byStateMap.get(code) || {
        name: inv.placeOfSupplyName || getStateName(code) || code,
        invoiceCount: 0,
        taxable: 0,
        igst: 0,
      };
      existing.invoiceCount += 1;
      existing.taxable += parseFloat(inv.subtotal.toString());
      existing.igst += parseFloat(inv.totalIgst.toString());
      byStateMap.set(code, existing);
    }

    const byState = Array.from(byStateMap.entries())
      .map(([placeOfSupply, data]) => ({
        placeOfSupply,
        placeOfSupplyName: data.name,
        invoiceCount: data.invoiceCount,
        totalTaxable: Math.round(data.taxable * 100) / 100,
        totalIgst: Math.round(data.igst * 100) / 100,
      }))
      .sort((a, b) => b.totalTaxable - a.totalTaxable);

    const interState = {
      invoiceCount: interStateInvoices.length,
      totalTaxable: this.sumField(interStateInvoices, 'subtotal'),
      totalIgst: this.sumField(interStateInvoices, 'totalIgst'),
      byState,
    };

    // Tax payable
    const taxPayable = {
      cgst: this.sumField(invoices, 'totalCgst'),
      sgst: this.sumField(invoices, 'totalSgst'),
      igst: this.sumField(invoices, 'totalIgst'),
      total: this.sumField(invoices, 'totalTax'),
    };

    return { outwardSupplies, interState, taxPayable };
  }

  // ─── EXPORT INVOICES AS CSV ───
  async getExportData(orgId: string, query: QueryInvoicesDto) {
    const where: any = {
      organizationId: orgId,
      ...(query.financialYear && { financialYear: query.financialYear }),
      ...(query.status && { status: query.status }),
      ...(query.sellerGstinId && { sellerGstinId: query.sellerGstinId }),
    };

    const invoices = await this.prisma.invoice.findMany({
      where,
      // Bounded: this used to be unlimited, so one request on a large tenant
      // could hydrate the whole table into memory and OOM the process for
      // every tenant. See EXPORT_ROW_CAP.
      take: EXPORT_ROW_CAP,
      orderBy: { invoiceDate: 'desc' },
      include: {
        order: { select: { name: true } },
      },
    });

    return invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString().split('T')[0],
      financialYear: inv.financialYear,
      orderNumber: inv.order.name,
      buyerName: inv.buyerName,
      buyerGstin: inv.buyerGstin || 'B2C',
      placeOfSupply: `${inv.placeOfSupply} - ${inv.placeOfSupplyName}`,
      gstType: inv.gstType,
      subtotal: inv.subtotal.toString(),
      cgst: inv.totalCgst.toString(),
      sgst: inv.totalSgst.toString(),
      igst: inv.totalIgst.toString(),
      totalTax: inv.totalTax.toString(),
      grandTotal: inv.grandTotal.toString(),
      status: inv.status,
    }));
  }

  // ─── GST RETURN CSV EXPORT ───
  async getGstReturnExportData(orgId: string, query: QueryGstReturnDto) {
    const returnData = await this.getGstReturn(orgId, query);

    if (query.returnType === GstReturnType.GSTR3B) {
      const data = returnData as any;
      const rows: any[] = [];

      // Outward supplies by rate
      for (const row of data.outwardSupplies || []) {
        rows.push({
          section: 'Outward Supplies',
          gstRate: `${row.gstRate}%`,
          taxableValue: row.taxableValue,
          cgst: row.cgst,
          sgst: row.sgst,
          igst: row.igst,
          totalTax: row.totalTax,
        });
      }

      // Inter-state summary
      rows.push({
        section: 'Inter-State Supplies',
        gstRate: '',
        taxableValue: data.interState?.totalTaxable || 0,
        cgst: 0,
        sgst: 0,
        igst: data.interState?.totalIgst || 0,
        totalTax: data.interState?.totalIgst || 0,
      });

      // Tax payable
      rows.push({
        section: 'Tax Payable',
        gstRate: '',
        taxableValue: '',
        cgst: data.taxPayable?.cgst || 0,
        sgst: data.taxPayable?.sgst || 0,
        igst: data.taxPayable?.igst || 0,
        totalTax: data.taxPayable?.total || 0,
      });

      return rows;
    }

    // GSTR-1 format
    const data = returnData as any;
    const rows: any[] = [];

    // B2B invoices
    for (const b2b of data.b2b || []) {
      for (const inv of b2b.invoices || []) {
        rows.push({
          section: 'B2B',
          buyerGstin: b2b.buyerGstin,
          buyerName: b2b.buyerName,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: new Date(inv.invoiceDate).toISOString().split('T')[0],
          placeOfSupply: '',
          taxableValue: inv.subtotal,
          cgst: inv.cgst,
          sgst: inv.sgst,
          igst: inv.igst,
          totalTax: inv.totalTax,
          grandTotal: inv.grandTotal,
        });
      }
    }

    // B2C summary
    for (const b2c of data.b2cSummary || []) {
      rows.push({
        section: 'B2C',
        buyerGstin: '',
        buyerName: '',
        invoiceNumber: `${b2c.invoiceCount} invoices`,
        invoiceDate: '',
        placeOfSupply: `${b2c.placeOfSupply} - ${b2c.placeOfSupplyName}`,
        taxableValue: b2c.totalTaxable,
        cgst: b2c.totalCgst,
        sgst: b2c.totalSgst,
        igst: b2c.totalIgst,
        totalTax: b2c.totalTax,
        grandTotal: '',
      });
    }

    // HSN summary
    for (const hsn of data.hsnSummary || []) {
      rows.push({
        section: 'HSN Summary',
        buyerGstin: '',
        buyerName: '',
        invoiceNumber: hsn.hsnCode,
        invoiceDate: '',
        placeOfSupply: '',
        taxableValue: hsn.taxable,
        cgst: '',
        sgst: '',
        igst: '',
        totalTax: hsn.tax,
        grandTotal: `Qty: ${hsn.quantity}`,
      });
    }

    return rows;
  }

  /**
   * Timezone for this org's GST date math, warning once if it had to fall back
   * to IST because GST is on but the timezone is still the untouched default.
   */
  private gstTimeZone(
    orgId: string,
    org: { timezone?: string | null; gstEnabled?: boolean | null } | null,
  ): string {
    const timeZone = resolveGstTimeZone(org ?? {});

    if (
      timeZone === INDIA_TZ &&
      (!org?.timezone || org.timezone === 'UTC') &&
      !gstTimeZoneFallbackWarned.has(orgId)
    ) {
      gstTimeZoneFallbackWarned.add(orgId);
      this.logger.warn(
        `Org ${orgId} has GST enabled but no timezone set (still "UTC"); ` +
          `using ${INDIA_TZ} for financial-year and GST period boundaries. ` +
          `Set the organization timezone in Settings to make this explicit.`,
      );
    }

    return timeZone;
  }

  // ─── HELPER: Resolve place of supply ───
  /**
   * Trust the code the ORDER was actually taxed with when it has one, so the
   * invoice can never report a different tax head or amount than the customer
   * was charged. Only orders created before `Order.placeOfSupplyCode` existed
   * (or an explicit caller override) fall through to the shared resolver.
   */
  private resolvePlaceOfSupply(
    dto: { placeOfSupplyCode?: string; buyerGstin?: string },
    order: any,
    sellerStateCode?: string | null,
  ): string {
    if (dto.placeOfSupplyCode && isValidStateCode(dto.placeOfSupplyCode)) {
      return dto.placeOfSupplyCode;
    }

    if (order.placeOfSupplyCode && isValidStateCode(order.placeOfSupplyCode)) {
      return order.placeOfSupplyCode;
    }

    return resolvePlaceOfSupply({
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress,
      customerBillingStateCode: order.customer?.billingStateCode,
      buyerGstin: dto.buyerGstin || order.customer?.gstin,
      // Over-the-counter default. Previously this chain bottomed out at '00',
      // which matches no StateTaxRate row, so a walk-in invoice could compute
      // 0% tax on a sale the order had charged the full rate for.
      sellerStateCode,
    });
  }

  private extractStateFromAddress(address: unknown): string | null {
    return extractStateFromAddress(address);
  }

  /**
   * Half-open [from, toExclusive) instants for a GST return period, anchored to
   * the merchant's timezone rather than the server's (which is UTC on every
   * deployment target). Delegates to the shared helper so the financial-year
   * stamp and the period window can't drift apart.
   */
  private getDateRangeForPeriod(
    financialYear: string,
    period: string,
    timeZone: string,
  ): { from: Date; toExclusive: Date } {
    return gstPeriodRange(financialYear, period, timeZone);
  }

  private sumField(items: any[], field: string): number {
    return Math.round(
      items.reduce(
        (sum, item) => sum + parseFloat(item[field]?.toString() || '0'),
        0,
      ) * 100,
    ) / 100;
  }
}
