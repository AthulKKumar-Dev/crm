/**
 * Three-way GST return reconciliation.
 *
 * For one organization and one filing period, compares:
 *
 *   DB   — raw SQL over `invoices` / `invoice_line_items`
 *   API  — `InvoiceService.getGstReturn` (the exact call the filing tab makes)
 *   CSV  — `InvoiceService.getGstReturnExportData` (the artefact actually filed)
 *
 * on invoice count, taxable value, IGST, CGST, SGST and invoice value — and
 * names the offending invoice on any delta.
 *
 * WHY THIS IS A REPO ARTEFACT rather than a throwaway. Unit tests prove the
 * accumulator folds correctly given invoices; they cannot prove that the QUERY
 * selects the right invoices, that the date window lands where the statute
 * says, or that the CSV a merchant downloads still adds up to the screen they
 * approved. This closes that gap, and it is the check to re-run after any
 * change to `getGstReturn`, the period maths, or the export.
 *
 * READ-ONLY. It opens no transaction and writes nothing.
 *
 *   npm run gst:reconcile -- --fy 2026-27 --period 08
 *   npm run gst:reconcile -- --fy 2026-27 --period 08 --org <orgId>
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { InvoiceService } from '../../src/invoice/invoice.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GstReturnType } from '../../src/invoice/dto/query-gst-return.dto';
import type { CsvSection } from '../../src/invoice/gst-return-rows';
import {
  gstPeriodRange,
  resolveGstTimeZone,
} from '../../src/common/utils/zoned-date.util';

interface Row {
  label: string;
  db: number;
  api: number;
  csv: number;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const financialYear = arg('fy');
  const period = arg('period');

  if (!financialYear || !period) {
    console.error('Usage: --fy 2026-27 --period 08 [--org <orgId>]');
    process.exit(2);
  }

  // Quiet the framework: this is a report, not a boot log.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  Logger.overrideLogger(['error']);

  const prisma = app.get(PrismaService);
  const invoices = app.get(InvoiceService);

  let orgId = arg('org');
  if (!orgId) {
    const org = await prisma.organization.findFirst({
      where: { gstEnabled: true },
      select: { id: true, name: true },
    });
    if (!org) {
      console.error('No GST-enabled organization found. Pass --org explicitly.');
      await app.close();
      process.exit(2);
    }
    orgId = org.id;
    console.log(`Organization: ${org.name} (${org.id})`);
  }

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { timezone: true, gstEnabled: true },
  });
  const timeZone = resolveGstTimeZone(org);
  const { from, toExclusive } = gstPeriodRange(financialYear, period, timeZone);

  console.log(`Period:       FY ${financialYear} / ${period}`);
  console.log(`Timezone:     ${timeZone}`);
  console.log(`Window:       ${from.toISOString()} .. ${toExclusive.toISOString()} (half-open)`);
  console.log('');

  // ── DB: raw SQL, deliberately NOT reusing the service's `where` ──
  // A shared predicate would make this agree with the API by construction and
  // prove nothing. The filter is restated here from the statutory definition:
  // issued invoices whose date falls inside the period window.
  const dbRows = await prisma.$queryRawUnsafe<
    Array<{
      invoice_count: bigint;
      credit_note_count: bigint;
      taxable: string | null;
      cgst: string | null;
      sgst: string | null;
      igst: string | null;
      total: string | null;
    }>
  >(
`-- NET of credit notes, matching what actually gets filed. A credit note is
     -- stored with POSITIVE amounts (as on the paper document) and subtracts
     -- here — the whole point of Phase 3 is that a refunded sale stops sitting
     -- in declared liability at its gross value.
     SELECT COUNT(*) FILTER (WHERE status = 'ISSUED')                              AS invoice_count,
            SUM(subtotal    * CASE WHEN status = 'CREDIT_NOTE' THEN -1 ELSE 1 END) AS taxable,
            SUM(total_cgst  * CASE WHEN status = 'CREDIT_NOTE' THEN -1 ELSE 1 END) AS cgst,
            SUM(total_sgst  * CASE WHEN status = 'CREDIT_NOTE' THEN -1 ELSE 1 END) AS sgst,
            SUM(total_igst  * CASE WHEN status = 'CREDIT_NOTE' THEN -1 ELSE 1 END) AS igst,
            SUM(grand_total * CASE WHEN status = 'CREDIT_NOTE' THEN -1 ELSE 1 END) AS total,
            COUNT(*) FILTER (WHERE status = 'CREDIT_NOTE')                         AS credit_note_count
       FROM invoices
      WHERE organization_id = $1
        AND status IN ('ISSUED', 'CREDIT_NOTE')
        AND invoice_date >= $2
        AND invoice_date <  $3`,
    orgId,
    from,
    toExclusive,
  );

  const db = dbRows[0];
  const dbCount = Number(db.invoice_count);
  const num = (v: string | null) => round2(parseFloat(v ?? '0'));

  // ── API ──
  const gstr1 = (await invoices.getGstReturn(orgId, {
    financialYear,
    period,
    returnType: GstReturnType.GSTR1,
  })) as any;

  const gstr3b = (await invoices.getGstReturn(orgId, {
    financialYear,
    period,
    returnType: GstReturnType.GSTR3B,
  })) as any;

  // ── CSV ──
  const csv1 = (await invoices.getGstReturnExportData(orgId, {
    financialYear,
    period,
    returnType: GstReturnType.GSTR1,
  })) as CsvSection[];

  const csv3b = (await invoices.getGstReturnExportData(orgId, {
    financialYear,
    period,
    returnType: GstReturnType.GSTR3B,
  })) as CsvSection[];

  // The CSV is now SECTIONED: each statutory table carries its own header
  // block, so a column is located by name within its section rather than by a
  // shared position. Reading it this way is also what makes this harness prove
  // the export — it walks the same structure a human downloads.
  const section = (sections: CsvSection[], startsWith: string) =>
    sections.find((s) => s.title.startsWith(startsWith));

  const sumCol = (
    sections: CsvSection[],
    startsWith: string,
    header: string,
  ): number => {
    const found = section(sections, startsWith);
    if (!found) return 0;
    const idx = found.headers.indexOf(header);
    if (idx < 0) return 0;
    return round2(
      found.rows.reduce((s, row) => s + (Number(row[idx]) || 0), 0),
    );
  };

  // B2B is invoice-wise; B2CL and B2CS between them cover every B2C invoice
  // exactly once. Together that is the same population as `totals`.
  const b2cTaxable = round2(
    sumCol(csv1, '5 —', 'Taxable value') + sumCol(csv1, '7 —', 'Taxable value'),
  );
  // Table 9B is split CDNR / CDNUR and both SUBTRACT: a credit note is stored
  // with positive amounts, exactly as it appears on the paper document, and the
  // filed figure is net of it.
  const cnCol = (header: string) =>
    round2(
      sumCol(csv1, '9B — Credit notes against registered', header) +
        sumCol(csv1, '9B — Credit notes against unregistered', header),
    );

  const csvTaxable = round2(
    sumCol(csv1, '4A', 'Taxable value') + b2cTaxable - cnCol('Taxable value'),
  );
  const csvCgst = round2(
    sumCol(csv1, '4A', 'CGST') + sumCol(csv1, '7 —', 'CGST') - cnCol('CGST'),
  );
  const csvSgst = round2(
    sumCol(csv1, '4A', 'SGST') + sumCol(csv1, '7 —', 'SGST') - cnCol('SGST'),
  );
  const csvIgst = round2(
    sumCol(csv1, '4A', 'IGST') +
      sumCol(csv1, '5 —', 'IGST') +
      sumCol(csv1, '7 —', 'IGST') -
      cnCol('IGST'),
  );
  // B2CL is one row per (invoice × rate), so count DISTINCT invoice numbers.
  const b2clInvoices = new Set(
    (section(csv1, '5 —')?.rows ?? []).map((r) => String(r[0])),
  ).size;
  const csvCount =
    (section(csv1, '4A')?.rows.length ?? 0) +
    b2clInvoices +
    // B2CS is summarised, so its invoices are counted from the API's own
    // per-state roll-up rather than from rows.
    (gstr1.b2cSummary ?? []).reduce(
      (s: number, e: any) =>
        s + (e.totalTaxable > 0 || e.invoiceCount > 0 ? e.invoiceCount : 0),
      0,
    ) -
    // ...minus the B2CL invoices, which the roll-up also counts.
    b2clInvoices;

  const rows: Row[] = [
    { label: 'Invoice count', db: dbCount, api: gstr1.totals.totalInvoices, csv: csvCount },
    { label: 'Taxable value', db: num(db.taxable), api: gstr1.totals.totalTaxable, csv: csvTaxable },
    { label: 'CGST', db: num(db.cgst), api: gstr1.totals.totalCgst, csv: csvCgst },
    { label: 'SGST', db: num(db.sgst), api: gstr1.totals.totalSgst, csv: csvSgst },
    { label: 'IGST', db: num(db.igst), api: gstr1.totals.totalIgst, csv: csvIgst },
  ];

  const pad = (s: string, n: number) => s.padEnd(n);
  const padL = (s: string, n: number) => s.padStart(n);

  console.log(`${pad('METRIC', 16)}${padL('DB', 16)}${padL('API', 16)}${padL('CSV', 16)}   OK`);
  console.log('-'.repeat(70));

  let failures = 0;
  for (const r of rows) {
    const ok = r.db === r.api && r.api === r.csv;
    if (!ok) failures += 1;
    const fmt = r.label === 'Invoice count' ? String : money;
    console.log(
      `${pad(r.label, 16)}${padL(fmt(r.db), 16)}${padL(fmt(r.api), 16)}${padL(fmt(r.csv), 16)}   ${ok ? 'yes' : 'NO'}`,
    );
  }

  // ── Cross-return consistency ──
  // GSTR-1 totals and GSTR-3B tax payable describe the same invoices, so they
  // must agree. They are reached by different code paths (invoice-level sums vs
  // line-item rate buckets), which is exactly why comparing them is worth doing.
  console.log('');
  console.log('GSTR-1 vs GSTR-3B');
  console.log('-'.repeat(70));
  // Reverse-charge supplies are the ONE legitimate reason these two disagree.
  // GSTR-1 reports every outward supply, table 4B included; GSTR-3B's tax
  // payable excludes 4B because the recipient pays that tax in their own
  // 3.1(d). Comparing the raw totals would report a false break every time a
  // merchant issues a reverse-charge invoice — so the RCM tax is added back to
  // the 3B side before comparing, which still catches a real drift of any
  // other kind.
  const rcm = gstr3b.outwardReverseCharge;
  const rcmTax = round2(Number(rcm?.tax ?? 0));
  const rcmSplit = await prisma.$queryRawUnsafe<Array<{ cgst: string; sgst: string; igst: string }>>(
    `SELECT COALESCE(SUM(total_cgst),0)::text AS cgst,
            COALESCE(SUM(total_sgst),0)::text AS sgst,
            COALESCE(SUM(total_igst),0)::text AS igst
       FROM invoices
      WHERE organization_id = $1
        AND reverse_charge = true
        AND status IN ('ISSUED','CREDIT_NOTE')
        AND invoice_date >= $2 AND invoice_date < $3`,
    orgId,
    from,
    toExclusive,
  );
  const rcmCgst = round2(Number(rcmSplit[0]?.cgst ?? 0));
  const rcmSgst = round2(Number(rcmSplit[0]?.sgst ?? 0));
  const rcmIgst = round2(Number(rcmSplit[0]?.igst ?? 0));

  const pairs: Array<[string, number, number]> = [
    ['CGST', gstr1.totals.totalCgst, round2(gstr3b.taxPayable.cgst + rcmCgst)],
    ['SGST', gstr1.totals.totalSgst, round2(gstr3b.taxPayable.sgst + rcmSgst)],
    ['IGST', gstr1.totals.totalIgst, round2(gstr3b.taxPayable.igst + rcmIgst)],
    ['Total tax', gstr1.totals.totalTax, round2(gstr3b.taxPayable.total + rcmTax)],
  ];
  for (const [label, a, b] of pairs) {
    const ok = Math.abs(a - b) < 0.01;
    if (!ok) failures += 1;
    console.log(
      `${pad(label, 16)}${padL(money(a), 16)}${padL(money(b), 16)}${padL('', 16)}   ${ok ? 'yes' : 'NO'}`,
    );
  }
  if (rcmTax > 0) {
    console.log(
      `${pad('  incl. reverse charge', 24)}${padL(money(rcmTax), 12)} added back to 3B (payable by the recipient)`,
    );
  }

  // The 3.2 rows are a MEMO of 3.1. If summing the CSV's igst column across
  // outward-supply rows does not equal tax payable, the file double-counts —
  // the exact defect the section renaming was meant to make impossible.
  const outwardIgst = sumCol(csv3b, '3.1(a)', 'IGST');
  const payableIgst = gstr3b.taxPayable.igst;
  const noDoubleCount = outwardIgst === payableIgst;
  if (!noDoubleCount) failures += 1;
  console.log('');
  console.log(
    `CSV 3.1 IGST sum = ${money(outwardIgst)} vs tax payable ${money(payableIgst)}   ${noDoubleCount ? 'yes' : 'NO'}`,
  );

  // ── Phase 2 structural invariants ──
  //
  // Both of these would catch a fold that drops or double-counts a line while
  // the headline totals still happened to agree.
  console.log('');
  console.log('Phase 2 structure');
  console.log('-'.repeat(70));

  // Table 5 + Table 7 must between them cover exactly the B2C population that
  // the per-state roll-up describes. If an invoice lands in both, or in
  // neither, this is where it shows.
  // Gross on both sides: b2cSummary is the invoice roll-up and excludes credit
  // notes, which are reported in 9B rather than folded into the B2C tables.
  const b2cRollup = round2(
    (gstr1.b2cSummary ?? []).reduce(
      (s: number, e: any) => s + Number(e.totalTaxable || 0),
      0,
    ),
  );
  const b2clPlusB2cs = b2cTaxable;
  const b2cSplitOk = Math.abs(b2clPlusB2cs - b2cRollup) < 0.01;
  if (!b2cSplitOk) failures += 1;
  console.log(
    `${pad('B2CL + B2CS', 24)}${padL(money(b2clPlusB2cs), 18)} vs roll-up ${padL(money(b2cRollup), 14)}   ${b2cSplitOk ? 'yes' : 'NO'}`,
  );

  // Table 12 covers every line of every invoice, so its taxable value must
  // equal the return's own total.
  const hsnTaxable = round2(
    (gstr1.hsnSummary ?? []).reduce(
      (s: number, h: any) => s + Number(h.taxableValue || 0),
      0,
    ),
  );
  // Against GROSS, not net: table 12 summarises invoice LINES, and credit
  // notes are reported separately in table 9B rather than folded into it.
  const hsnOk = Math.abs(hsnTaxable - gstr1.totals.grossTaxable) < 0.01;
  if (!hsnOk) failures += 1;
  console.log(
    `${pad('Table 12 vs gross', 24)}${padL(money(hsnTaxable), 18)} vs gross    ${padL(money(gstr1.totals.grossTaxable), 12)}   ${hsnOk ? 'yes' : 'NO'}`,
  );

  // The B2B and B2C halves of Table 12 must each tie to their own supplies.
  // The combined check above would still pass if a row landed on the wrong
  // tab — which is precisely the error the May-2025 split makes possible, and
  // precisely what the portal rejects.
  const hsnRows = gstr1.hsnSummary ?? [];
  const sumWhere = (side: string) =>
    round2(
      hsnRows
        .filter((h: any) => h.recipientType === side)
        .reduce((s: number, h: any) => s + Number(h.taxableValue || 0), 0),
    );

  // 4A is invoice-wise and gross; HSN-B2B is line-wise and gross. Both derive
  // from the same invoices, so the identity is exact, not approximate.
  const b2bInvoiceTaxable = round2(
    (gstr1.b2b ?? []).reduce(
      (s: number, g: any) => s + Number(g.totalTaxable || 0),
      0,
    ),
  );
  const hsnB2bOk = Math.abs(sumWhere('B2B') - b2bInvoiceTaxable) < 0.01;
  if (!hsnB2bOk) failures += 1;
  console.log(
    `${pad('HSN-B2B vs table 4A', 24)}${padL(money(sumWhere('B2B')), 18)} vs 4A       ${padL(money(b2bInvoiceTaxable), 12)}   ${hsnB2bOk ? 'yes' : 'NO'}`,
  );

  const hsnB2cOk = Math.abs(sumWhere('B2C') - b2cRollup) < 0.01;
  if (!hsnB2cOk) failures += 1;
  console.log(
    `${pad('HSN-B2C vs roll-up', 24)}${padL(money(sumWhere('B2C')), 18)} vs roll-up ${padL(money(b2cRollup), 14)}   ${hsnB2cOk ? 'yes' : 'NO'}`,
  );

  // Table 13: the serial span must be explained by documents actually present.
  // A shortfall is either a real gap in a statutory run, or the effect of
  // scoping to one GSTIN while the series runs org-wide — this harness is
  // unscoped, so here it can only be the former.
  const docSeries = gstr1.documentsIssued;
  if (docSeries) {
    const gaps = (docSeries.rows ?? []).filter(
      (r: any) => r.total !== r.documents,
    );
    const docsOk = gaps.length === 0 && docSeries.unparsed === 0;
    if (!docsOk) failures += 1;
    const detail = gaps.length
      ? gaps
          .map((r: any) => `${r.series}: span ${r.total} vs ${r.documents} present`)
          .join(', ')
      : `${(docSeries.rows ?? []).length} series, all gapless`;
    console.log(
      `${pad('Table 13 documents', 24)}${padL(detail, 46)}   ${docsOk ? 'yes' : 'NO'}`,
    );
  }

  const cnDbCount = Number(db.credit_note_count);
  const cnApiCount = gstr1.totals.creditNoteCount ?? 0;
  const cnOk = cnDbCount === cnApiCount;
  if (!cnOk) failures += 1;
  console.log(
    `${pad('Credit notes', 24)}${padL(String(cnDbCount), 18)} vs API      ${padL(String(cnApiCount), 12)}   ${cnOk ? 'yes' : 'NO'}`,
  );
  if (cnApiCount > 0) {
    console.log(
      `${pad('  reversing', 24)}${padL(money(gstr1.totals.creditNoteTaxable), 18)} taxable, ${money(gstr1.totals.creditNoteTax)} tax`,
    );
  }

  // Not a failure — a readiness figure. A return cannot be filed while any
  // line has no HSN, but that is a catalogue task, not a bug in this code.
  const missing = gstr1.totals.linesMissingHsn ?? 0;
  console.log(
    `${pad('Lines missing an HSN', 24)}${padL(String(missing), 18)}${missing > 0 ? '   (must reach 0 before filing)' : ''}`,
  );

  // ── Per-invoice detail on any delta ──
  if (failures > 0) {
    console.log('');
    console.log('Invoices in window (for locating the delta):');
    const detail = await prisma.invoice.findMany({
      where: {
        organizationId: orgId,
        status: 'ISSUED',
        invoiceDate: { gte: from, lt: toExclusive },
      },
      select: {
        invoiceNumber: true,
        buyerGstin: true,
        placeOfSupply: true,
        gstType: true,
        subtotal: true,
        totalCgst: true,
        totalSgst: true,
        totalIgst: true,
        taxMismatch: true,
      },
      orderBy: { invoiceNumber: 'asc' },
    });
    for (const d of detail) {
      console.log(
        `  ${d.invoiceNumber}  ${d.buyerGstin ? 'B2B' : 'B2C'}  POS ${d.placeOfSupply}  ` +
          `${d.gstType}  taxable ${d.subtotal}  cgst ${d.totalCgst} sgst ${d.totalSgst} igst ${d.totalIgst}` +
          `${d.taxMismatch ? '  [TAX MISMATCH]' : ''}`,
      );
    }
  }

  console.log('');
  console.log(failures === 0 ? 'RECONCILED — all three agree.' : `${failures} MISMATCH(ES).`);

  await app.close();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
