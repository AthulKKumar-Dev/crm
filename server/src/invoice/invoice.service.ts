import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { GstType, InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GstService } from '../gst/gst.service';
import {
  GstCalculatorService,
  GstCalculationResult,
} from '../gst/gst-calculator.service';
import { getStateName, isValidStateCode } from '../gst/constants/indian-states';
import { extractStateCodeFromGstin } from '../gst/constants/gst-rates';
import { TaxResolverService } from '../gst/tax-resolver.service';
import { InvoiceNumberService } from './invoice-number.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { QueryGstReturnDto, GstReturnType } from './dto/query-gst-return.dto';

@Injectable()
export class InvoiceService {
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
  async create(orgId: string, dto: CreateInvoiceDto) {
    return this.prisma.$transaction((tx) =>
      this.createForOrderTx(tx, orgId, dto.orderId, dto),
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
      where: { id: orderId, organizationId: orgId },
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

    // 2. Check if GST is enabled for the org
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { gstEnabled: true },
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

    // 4. Determine place of supply
    const placeOfSupplyCode = this.resolvePlaceOfSupply(dto, order);
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
      const productGstRate = this.calculator.toNumber(item.variant?.product?.gstRate);
      const productId = item.variant?.product?.id ?? null;
      const gstRate = await this.taxResolver.resolveGstRate(
        orgId,
        productId,
        productGstRate || null,
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

    // 7. Calculate invoice totals
    const calculations = lineItemResults.map((r) => r.calculation);
    const totals = this.calculator.calculateInvoiceTotals(
      calculations,
      this.calculator.toNumber(order.totalDiscounts),
    );

    // 8. Generate invoice number (passes the same tx so it's atomic with the create below)
    const invoiceDate = new Date();
    const financialYear = this.calculator.getFinancialYear(invoiceDate);
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
            unitPrice: r.calculation.taxableValue / r.orderLineItem.quantity + r.calculation.taxableValue === 0 ? 0 : this.calculator.toNumber(r.orderLineItem.price),
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

    const where: any = {
      organizationId: orgId,
      ...(query.financialYear && { financialYear: query.financialYear }),
      ...(query.status && { status: query.status }),
      ...(query.sellerGstinId && { sellerGstinId: query.sellerGstinId }),
      ...(query.search && {
        OR: [
          { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
          { buyerName: { contains: query.search, mode: 'insensitive' } },
          { buyerGstin: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.dateFrom || query.dateTo
        ? {
            invoiceDate: {
              ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
              ...(query.dateTo && { lte: new Date(query.dateTo) }),
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
          order: { select: { name: true, orderNumber: true } },
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
    const dateRange = this.getDateRangeForPeriod(
      query.financialYear,
      query.period,
    );

    const where: any = {
      organizationId: orgId,
      financialYear: query.financialYear,
      status: InvoiceStatus.ISSUED,
      invoiceDate: {
        gte: dateRange.from,
        lte: dateRange.to,
      },
      ...(query.sellerGstinId && { sellerGstinId: query.sellerGstinId }),
    };

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: { lineItems: true },
    });

    if (query.returnType === GstReturnType.GSTR3B) {
      return this.generateGstr3B(invoices);
    }

    return this.generateGstr1(invoices);
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
    const interState = {
      invoiceCount: interStateInvoices.length,
      totalTaxable: this.sumField(interStateInvoices, 'subtotal'),
      totalIgst: this.sumField(interStateInvoices, 'totalIgst'),
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

  // ─── HELPER: Resolve place of supply ───
  private resolvePlaceOfSupply(
    dto: { placeOfSupplyCode?: string; buyerGstin?: string },
    order: any,
  ): string {
    // Priority: explicit > shipping address > billing address > customer > fallback
    if (dto.placeOfSupplyCode && isValidStateCode(dto.placeOfSupplyCode)) {
      return dto.placeOfSupplyCode;
    }

    const shippingState = this.extractStateFromAddress(order.shippingAddress);
    if (shippingState) return shippingState;

    const billingState = this.extractStateFromAddress(order.billingAddress);
    if (billingState) return billingState;

    if (order.customer?.billingStateCode) {
      return order.customer.billingStateCode;
    }

    // If buyer has GSTIN, extract state from it
    const buyerGstin = dto.buyerGstin || order.customer?.gstin;
    if (buyerGstin) {
      return extractStateCodeFromGstin(buyerGstin);
    }

    return '00'; // Unknown — will need manual correction
  }

  // ─── HELPER: Extract state code from address JSON ───
  private extractStateFromAddress(address: any): string | null {
    if (!address) return null;

    // Shopify format: province_code (e.g. "MH" for Maharashtra)
    // We need to map this or use a direct state code field
    if (address.province_code) {
      const provinceToState = this.getProvinceToStateMapping();
      return provinceToState[address.province_code] || null;
    }

    // Direct state code
    if (address.stateCode) return address.stateCode;

    return null;
  }

  // ─── HELPER: Map Shopify province codes to Indian state codes ───
  private getProvinceToStateMapping(): Record<string, string> {
    return {
      AN: '35', AP: '37', AR: '12', AS: '18', BR: '10',
      CG: '22', CH: '04', DD: '26', DL: '07', GA: '30',
      GJ: '24', HP: '02', HR: '06', JH: '20', JK: '01',
      KA: '29', KL: '32', LA: '38', LD: '31', MH: '27',
      ML: '17', MN: '14', MP: '23', MZ: '15', NL: '13',
      OR: '21', PB: '03', PY: '34', RJ: '08', SK: '11',
      TN: '33', TS: '36', UK: '05', UP: '09', WB: '19',
    };
  }

  // ─── HELPER: Get date range for return period ───
  private getDateRangeForPeriod(
    financialYear: string,
    period: string,
  ): { from: Date; to: Date } {
    // Parse financial year: "2025-26" → startYear=2025
    const startYear = parseInt(financialYear.split('-')[0], 10);

    if (period.startsWith('Q')) {
      // Quarterly: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
      const quarter = parseInt(period.substring(1), 10);
      const quarterMonths: Record<number, [number, number, number]> = {
        1: [3, startYear, 5],     // Apr-Jun (month 3-5, 0-indexed)
        2: [6, startYear, 8],     // Jul-Sep
        3: [9, startYear, 11],    // Oct-Dec
        4: [0, startYear + 1, 2], // Jan-Mar (next calendar year)
      };
      const [fromMonth, fromYear, toMonth] = quarterMonths[quarter] || quarterMonths[1];
      const toYear = quarter === 4 ? startYear + 1 : startYear;
      return {
        from: new Date(fromYear, fromMonth, 1),
        to: new Date(toYear, toMonth + 1, 0, 23, 59, 59),
      };
    }

    // Monthly: "04" = April, "01" = January (of next year if Jan-Mar)
    const month = parseInt(period, 10) - 1; // Convert to 0-indexed
    const year = month >= 3 ? startYear : startYear + 1;

    return {
      from: new Date(year, month, 1),
      to: new Date(year, month + 1, 0, 23, 59, 59),
    };
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
