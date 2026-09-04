import { PayloadTooLargeException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GstType, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GstService } from '../gst/gst.service';
import { GstCalculatorService } from '../gst/gst-calculator.service';
import { TaxResolverService } from '../gst/tax-resolver.service';
import { InvoiceNumberService } from './invoice-number.service';
import { InvoiceService } from './invoice.service';
import { GstReturnType } from './dto/query-gst-return.dto';

/**
 * `getGstReturn` assembles a STATUTORY FILING.
 *
 * The defect this covers: it used to be a single `findMany({ take: 10_000 })`
 * with no `orderBy`. A period with more invoices than that returned a
 * nondeterministic subset and reported it as the complete return — the merchant
 * filed under-declared figures and nothing anywhere said so. Silently
 * under-reporting is the worst available failure mode for this endpoint, which
 * is why the cap now throws instead of truncating.
 */
describe('InvoiceService.getGstReturn', () => {
  let service: InvoiceService;
  let prisma: {
    organization: { findUnique: jest.Mock };
    organizationSettings: { findUnique: jest.Mock };
    inwardSupply: { findMany: jest.Mock };
    invoice: { count: jest.Mock; findMany: jest.Mock };
  };

  /** A minimal issued invoice, as `include: { lineItems: true }` returns it. */
  const invoiceAt = (n: number) => ({
    status: InvoiceStatus.ISSUED,
    id: `inv_${String(n).padStart(6, '0')}`,
    invoiceNumber: `INV-2026-27/${String(n).padStart(6, '0')}`,
    invoiceDate: new Date('2026-08-10T00:00:00.000Z'),
    buyerGstin: null,
    buyerName: 'Guest Customer',
    placeOfSupply: '29',
    placeOfSupplyName: 'Karnataka',
    gstType: GstType.IGST,
    subtotal: '100.00',
    totalCgst: '0.00',
    totalSgst: '0.00',
    totalIgst: '18.00',
    totalTax: '18.00',
    grandTotal: '118.00',
    lineItems: [
      {
        hsnCode: '6109',
        unitOfMeasure: 'NOS',
        supplyType: 'TAXABLE',
        description: 'Cotton Shirt',
        quantity: 1,
        taxableValue: '100.00',
        gstRate: '18.00',
        cgstAmount: '0.00',
        sgstAmount: '0.00',
        igstAmount: '18.00',
        totalTax: '18.00',
      },
    ],
  });

  beforeEach(async () => {
    prisma = {
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ timezone: 'Asia/Kolkata', gstEnabled: true }),
      },
      // The B2CL threshold reaches the accumulator from here. Null means the
      // org never configured one, so the schema default applies.
      organizationSettings: {
        findUnique: jest.fn().mockResolvedValue({ taxSettings: null }),
      },
      // GSTR-3B 3.1(d) reads reverse-charge purchases from here. Empty by
      // default: a period with no imported services must produce a zeroed row,
      // not a crash.
      inwardSupply: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { count: jest.fn(), findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: PrismaService, useValue: prisma },
        { provide: GstService, useValue: {} },
        { provide: GstCalculatorService, useValue: new GstCalculatorService() },
        { provide: TaxResolverService, useValue: {} },
        { provide: InvoiceNumberService, useValue: {} },
      ],
    }).compile();

    service = module.get(InvoiceService);
  });

  const query = {
    financialYear: '2026-27',
    period: '08',
    returnType: GstReturnType.GSTR1,
  };

  it('refuses to build a return larger than the cap, naming the real count', async () => {
    // Erroring is deliberate. Returning 50,000 of 62,431 invoices would look
    // like a complete return and be filed as one.
    prisma.invoice.count.mockResolvedValue(62_431);

    await expect(service.getGstReturn('org1', query)).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
    await expect(service.getGstReturn('org1', query)).rejects.toThrow(/62,431/);
    // It must not have started hydrating rows before refusing.
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it('pages with a cursor and drops no invoice', async () => {
    // 2,500 invoices across three pages of 1,000. The old single capped query
    // would have returned an arbitrary subset with no ordering at all.
    const all = Array.from({ length: 2_500 }, (_, i) => invoiceAt(i + 1));
    prisma.invoice.count.mockResolvedValue(all.length);
    prisma.invoice.findMany.mockImplementation(({ cursor, take }: any) => {
      const start = cursor ? all.findIndex((i) => i.id === cursor.id) + 1 : 0;
      return Promise.resolve(all.slice(start, start + take));
    });

    const result: any = await service.getGstReturn('org1', query);

    expect(result.totals.totalInvoices).toBe(2_500);
    // 2500 × 100.00 and 2500 × 18.00, exactly.
    expect(result.totals.totalTaxable).toBe(250_000);
    expect(result.totals.totalIgst).toBe(45_000);
    // Three fold pages, plus one lean read for Table 13 (documents issued),
    // which must also count CANCELLED invoices the fold deliberately excludes.
    expect(prisma.invoice.findMany).toHaveBeenCalledTimes(4);
  });

  it('orders by a unique column, so pages cannot skip or repeat rows', async () => {
    // `invoiceDate` is not unique — cursoring on it loses rows at page
    // boundaries. `id` is the primary key.
    prisma.invoice.count.mockResolvedValue(1);
    prisma.invoice.findMany.mockResolvedValue([invoiceAt(1)]);

    await service.getGstReturn('org1', query);

    expect(prisma.invoice.findMany.mock.calls[0][0].orderBy).toEqual({ id: 'asc' });
  });

  it('stops after a short page instead of querying forever', async () => {
    prisma.invoice.count.mockResolvedValue(3);
    prisma.invoice.findMany.mockResolvedValue([invoiceAt(1), invoiceAt(2), invoiceAt(3)]);

    await service.getGstReturn('org1', query);

    // One fold page (short, so no second) plus the Table 13 read.
    expect(prisma.invoice.findMany).toHaveBeenCalledTimes(2);
  });

  it('filters on the timezone-anchored window, NOT the stored financialYear', async () => {
    // `financialYear` is stamped at issue time from the org's then-current
    // timezone; the window is computed from the current one. AND-ing both
    // silently dropped invoices near 1 April whenever the two disagreed.
    prisma.invoice.count.mockResolvedValue(0);
    prisma.invoice.findMany.mockResolvedValue([]);

    await service.getGstReturn('org1', query);

    const where = prisma.invoice.count.mock.calls[0][0].where;
    expect(where.financialYear).toBeUndefined();
    expect(where.organizationId).toBe('org1');
    // Credit notes ride along: they are reported in table 9B and netted out of
    // 3.1(a), so excluding them is what left refunded sales in liability.
    expect(where.status).toEqual({
      in: [InvoiceStatus.ISSUED, InvoiceStatus.CREDIT_NOTE],
    });
    // August 2026 in IST: 1 Aug 00:00 IST === 31 Jul 18:30 UTC, half-open.
    expect(where.invoiceDate.gte.toISOString()).toBe('2026-07-31T18:30:00.000Z');
    expect(where.invoiceDate.lt.toISOString()).toBe('2026-08-31T18:30:00.000Z');
  });

  it('uses the same predicate for the count and the pages', async () => {
    // A divergence between them would let the cap police a different set than
    // the one actually assembled — the truncation bug in a subtler form.
    prisma.invoice.count.mockResolvedValue(1);
    prisma.invoice.findMany.mockResolvedValue([invoiceAt(1)]);

    await service.getGstReturn('org1', query);

    expect(prisma.invoice.findMany.mock.calls[0][0].where).toBe(
      prisma.invoice.count.mock.calls[0][0].where,
    );
  });

  it('scopes to one registration when a seller GSTIN is given', async () => {
    // A multi-GSTIN org files one return per registration; without this the
    // filing tab could only ever show a merged return.
    prisma.invoice.count.mockResolvedValue(0);
    prisma.invoice.findMany.mockResolvedValue([]);

    await service.getGstReturn('org1', { ...query, sellerGstinId: 'gstin_1' });

    expect(prisma.invoice.count.mock.calls[0][0].where.sellerGstinId).toBe('gstin_1');
  });

  it('rejects an unparseable period as a 400, not a 500', async () => {
    // `gstPeriodRange` throws a bare Error, which NestJS renders as a 500. The
    // DTO rejects these first; this is the guard for any caller that bypasses it.
    await expect(
      service.getGstReturn('org1', { ...query, period: 'nonsense' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('builds GSTR-3B from the same paged read', async () => {
    prisma.invoice.count.mockResolvedValue(2);
    prisma.invoice.findMany.mockResolvedValue([invoiceAt(1), invoiceAt(2)]);

    const result: any = await service.getGstReturn('org1', {
      ...query,
      returnType: GstReturnType.GSTR3B,
    });

    expect(result.taxPayable.igst).toBe(36); // 2 × 18.00
    expect(result.outwardSupplies[0].gstRate).toBe(18);
    // Both invoices are B2C and inter-state, so both belong in table 3.2.
    expect(result.interState.byState[0].invoiceCount).toBe(2);
  });
});

/**
 * Automatic invoicing on the payment edge.
 *
 * Two failures this covers, both seen on real data:
 *   - a redelivered or concurrent webhook re-attempted an invoice, was
 *     correctly rejected with "already exists", and that rejection was stored
 *     on the order as a permanent error — on an order that was perfectly
 *     invoiced — which then drove the uninvoiced-orders banner.
 *   - paying an order inside the CRM wrote PAID locally, so the reconciling
 *     webhook saw PAID → PAID, `becamePaid` returned false, and no invoice was
 *     ever issued.
 */
describe('InvoiceService.autoInvoiceForPaidOrder', () => {
  const ORG = 'org_1';
  const ORDER = 'order_1';

  function build(opts: { enabled?: boolean; liveInvoice?: boolean; createError?: Error } = {}) {
    const orderUpdates: Array<{ where: any; data: any }> = [];
    const prisma = {
      organizationSettings: {
        findUnique: jest.fn().mockResolvedValue({
          orderSettings: { autoInvoiceOnPayment: opts.enabled ?? true },
        }),
      },
      invoice: {
        findFirst: jest.fn().mockResolvedValue(opts.liveInvoice ? { id: 'inv_1' } : null),
      },
      order: {
        updateMany: jest.fn((args: any) => {
          orderUpdates.push(args);
          return Promise.resolve({ count: 1 });
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new InvoiceService(
      prisma as any, {} as any, {} as any, {} as any, {} as any,
    );
    const create = jest
      .spyOn(service, 'create')
      .mockImplementation(async () =>
        opts.createError
          ? Promise.reject(opts.createError)
          : ({ invoiceNumber: 'INV-26-27/000001' } as any),
      );
    return { service, prisma, create, orderUpdates };
  }

  it('issues an invoice when the org has opted in', async () => {
    const { service, create } = build();
    await service.autoInvoiceForPaidOrder(ORG, ORDER);
    expect(create).toHaveBeenCalledWith(ORG, { orderId: ORDER });
  });

  it('does nothing when the org has not opted in', async () => {
    const { service, create, orderUpdates } = build({ enabled: false });
    await service.autoInvoiceForPaidOrder(ORG, ORDER);
    expect(create).not.toHaveBeenCalled();
    // Not an error either — the merchant chose this.
    expect(orderUpdates).toHaveLength(0);
  });

  it('records the reason when invoicing genuinely fails', async () => {
    const { service, orderUpdates } = build({
      createError: new Error('No GSTIN registration found.'),
    });
    await service.autoInvoiceForPaidOrder(ORG, ORDER);
    expect(orderUpdates).toHaveLength(1);
    expect(orderUpdates[0].data.invoiceError).toMatch(/No GSTIN/);
    expect(orderUpdates[0].data.invoiceErrorAt).toBeInstanceOf(Date);
  });

  it('treats a duplicate attempt on an already-invoiced order as success', async () => {
    const { service, orderUpdates } = build({
      liveInvoice: true,
      createError: new Error('Invoice INV-26-27/000001 already exists for this order.'),
    });

    await service.autoInvoiceForPaidOrder(ORG, ORDER);

    // Clears any stale error rather than recording a new one.
    expect(orderUpdates).toHaveLength(1);
    expect(orderUpdates[0].data).toEqual({ invoiceError: null, invoiceErrorAt: null });
    expect(orderUpdates[0].where.invoiceError).toEqual({ not: null });
  });

  it('never throws, so it cannot break the payment that triggered it', async () => {
    const { service } = build({ createError: new Error('boom') });
    await expect(service.autoInvoiceForPaidOrder(ORG, ORDER)).resolves.toBeUndefined();
  });
});
