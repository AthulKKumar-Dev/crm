/**
 * End-to-end: does the payment-fee path work against a real database, and does
 * it leave every return figure untouched?
 *
 * Run:  npm run gst:rcm-check
 * Cleans up after itself, on failure as well as success.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { InwardSupplyService } from '../../src/inward-supply/inward-supply.service';
import { InvoiceService } from '../../src/invoice/invoice.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { buildGstr3bSections } from '../../src/invoice/gst-return-rows';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = String(actual) === String(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${String(actual).padStart(14)}` +
      (ok ? '' : `   expected ${expected}`),
  );
}

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  Logger.overrideLogger(['error']);
  const fees = app.get(InwardSupplyService);
  const invoices = app.get(InvoiceService);
  const prisma = app.get(PrismaService);

  const org = await prisma.organization.findFirstOrThrow({
    where: { slug: 'gst-fixtures' },
    select: { id: true, name: true },
  });
  const q = { financialYear: '2026-27', period: '09' };

  // Return totals BEFORE any fee exists.
  const before: any = await invoices.getGstReturn(org.id, {
    returnType: 'GSTR1', ...q,
  } as never);

  console.log(`\nOrg: ${org.name}\n`);

  try {
    // ── Empty period ────────────────────────────────────────────────────────
    let list = await fees.list(org.id, q);
    check('empty period: fee total', list.summary.totalFee, 0);
    check('empty period: GST is null not zero', String(list.summary.totalGst), 'null');

    // ── One domestic gateway with stated GST ────────────────────────────────
    await fees.upsert(org.id, {
      ...q, supplier: 'Razorpay', feeAmount: 1000, gstAmount: 180,
      supplierGstin: '29aabcu9603r1zm',
    });
    list = await fees.list(org.id, q);
    check('after Razorpay: fee', list.summary.totalFee, 1000);
    check('after Razorpay: claimable GST', list.summary.totalGst, 180);
    check('GSTIN normalised to upper case', list.fees[0].supplierGstin, '29AABCU9603R1ZM');

    // ── Re-entering the SAME gateway corrects, never duplicates ─────────────
    await fees.upsert(org.id, { ...q, supplier: 'Razorpay', feeAmount: 1200, gstAmount: 216 });
    list = await fees.list(org.id, q);
    check('re-entry corrects rather than duplicating', list.fees.length, 1);
    check('corrected fee', list.summary.totalFee, 1200);
    check('corrected GST', list.summary.totalGst, 216);
    check('omitted GSTIN cleared, not kept stale', String(list.fees[0].supplierGstin), 'null');

    // ── A foreign gateway whose invoice states no GST ───────────────────────
    await fees.upsert(org.id, {
      ...q, supplier: 'Shopify', feeAmount: 500, isReverseCharge: true,
    });
    list = await fees.list(org.id, q);
    check('two gateways now', list.fees.length, 2);
    check('fees add up', list.summary.totalFee, 1700); // 1200 + 500
    check('unknown GST not summed as zero', list.summary.totalGst, 216);
    check('unknown GST is flagged', list.summary.rowsWithUnknownGst, 1);

    // ── Supplying the missing figure completes the claim ────────────────────
    await fees.upsert(org.id, {
      ...q, supplier: 'Shopify', feeAmount: 500, gstAmount: 90, isReverseCharge: true,
    });
    list = await fees.list(org.id, q);
    check('claim now complete', list.summary.rowsWithUnknownGst, 0);
    check('total claimable GST', list.summary.totalGst, 306); // 216 + 90
    check('reverse-charge portion isolated', list.summary.reverseChargeGst, 90);

    // ── THE LOAD-BEARING CHECK: the return has not moved ────────────────────
    const after: any = await invoices.getGstReturn(org.id, {
      returnType: 'GSTR1', ...q,
    } as never);
    check('GSTR-1 taxable unchanged', after.totals.totalTaxable, before.totals.totalTaxable);
    check('GSTR-1 total tax unchanged', after.totals.totalTax, before.totals.totalTax);
    check('GSTR-1 invoice count unchanged', after.totals.totalInvoices, before.totals.totalInvoices);

    const b3: any = await invoices.getGstReturn(org.id, { returnType: 'GSTR3B', ...q } as never);
    check('GSTR-3B tax payable unchanged by purchases', b3.taxPayable.total, before.totals.totalTax);

    // ── Reverse charge reaches 3.1(d) and 4(A)(3) ───────────────────────────
    // The Shopify entry above is flagged reverse charge: 500 of imported
    // service, 90 of IGST. Razorpay is a domestic supply and must NOT appear.
    check('3.1(d) taxable value', b3.reverseCharge.taxableValue, 500);
    check('3.1(d) IGST', b3.reverseCharge.igst, 90);
    check('domestic supply excluded from 3.1(d)', b3.reverseCharge.taxableValue, 500);
    check('nothing unknown left', b3.reverseCharge.entriesWithUnknownTax, 0);

    const csv = buildGstr3bSections(b3);
    const section = (prefix: string) =>
      csv.find((s: any) => s.title.startsWith(prefix));
    check('CSV carries a 3.1(d) block', Boolean(section('3.1(d)')), true);
    check('CSV carries a 4(A)(3) block', Boolean(section('4(A)(3)')), true);
    check('3.1(d) and 4(A)(3) IGST agree',
      String(section('4(A)(3)')!.rows[0][0]),
      String(section('3.1(d)')!.rows[0][1]));
    // 3.1(a) must not have absorbed the inward figure.
    check('outward 3.1(a) untouched by reverse charge',
      section('3.1(a)')!.rows.reduce(
        (sum: number, r: any[]) => sum + Number(r[4]), 0),
      before.totals.totalIgst);

    // ── Tenant isolation ────────────────────────────────────────────────────
    let refused = false;
    try {
      await fees.remove('some-other-org', list.fees[0].id);
    } catch {
      refused = true;
    }
    check('another org cannot delete this entry', refused, true);
  } finally {
    await prisma.inwardSupply.deleteMany({ where: { organizationId: org.id } });
    console.log('\nCleaned up: fee entries removed.');
    await app.close();
  }

  console.log(
    failures === 0
      ? '\nAll checks passed — fees recorded, claim computed, return untouched.\n'
      : `\n${failures} CHECK(S) FAILED\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
