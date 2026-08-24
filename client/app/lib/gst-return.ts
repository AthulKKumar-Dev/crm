import type {
  Gstr1B2bEntry,
  Gstr3bOutwardSupply,
} from "~/types/api";

/**
 * Pure helpers for the GST filing views — financial-year maths, statutory due
 * dates, and the roll-ups the section cards display.
 *
 * Deliberately React-free so the date logic can be reasoned about (and later
 * tested) without rendering. `getCurrentFinancialYear` and `MONTHS` moved here
 * from `routes/app/orders/invoices.tsx`.
 */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** Return-period options, in Indian financial-year order (April first). */
export const MONTHS: ReadonlyArray<{ value: string; label: string }> =
  [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map((month) => ({
    value: String(month).padStart(2, "0"),
    label: MONTH_NAMES[month - 1],
  }));

/** Indian FY runs April–March, so Jan–Mar belong to the year that started before. */
export function getCurrentFinancialYear(now: Date = new Date()): string {
  const month = now.getMonth(); // 0-indexed
  const year = now.getFullYear();
  const startYear = month >= 3 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

/** The period the app should land on by default — the current calendar month. */
export function getCurrentPeriod(now: Date = new Date()): string {
  return String(now.getMonth() + 1).padStart(2, "0");
}

/**
 * Calendar year a period falls in. FY "2026-27" period "07" is July 2026, but
 * period "02" is February *2027* — the year rolls over inside one FY.
 */
function periodCalendarYear(financialYear: string, period: string): number | null {
  const startYear = Number(financialYear.slice(0, 4));
  const month = Number(period);
  if (!Number.isFinite(startYear) || !Number.isFinite(month)) return null;
  return month >= 4 ? startYear : startYear + 1;
}

/** "2026-27" + "07" → "July 2026". Null for non-month periods (e.g. "Q1"). */
export function formatPeriodLabel(
  financialYear: string,
  period: string,
): string | null {
  const year = periodCalendarYear(financialYear, period);
  const month = Number(period);
  if (year === null || !(month >= 1 && month <= 12)) return null;
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Short form for compact rows — "Jul 2026". */
export function formatPeriodShort(
  financialYear: string,
  period: string,
): string | null {
  const full = formatPeriodLabel(financialYear, period);
  if (!full) return null;
  const [month, year] = full.split(" ");
  return `${month.slice(0, 3)} ${year}`;
}

/**
 * Statutory filing deadline: monthly GSTR-1 is due on the 11th of the month
 * *after* the return period, GSTR-3B on the 20th.
 *
 * Note this reports the real statutory dates. The reference design showed
 * "11 Sep" against a July period (which would be 11 Aug) and a day count that
 * did not match its own date, so its figures were not reproduced.
 */
export function returnDueDate(
  financialYear: string,
  period: string,
  returnType: "GSTR1" | "GSTR3B",
): Date | null {
  const year = periodCalendarYear(financialYear, period);
  const month = Number(period);
  if (year === null || !(month >= 1 && month <= 12)) return null;

  const dayOfMonth = returnType === "GSTR1" ? 11 : 20;
  // `month` is 1-indexed and Date's is 0-indexed, so passing `month` lands on
  // the *following* month already. December rolls into January automatically.
  return new Date(year, month, dayOfMonth);
}

/**
 * Whole days from today until `date`. Negative once the deadline has passed.
 * Both sides are floored to local midnight so a deadline later today reads as
 * "0 days left" rather than a fraction.
 */
export function daysUntil(date: Date, now: Date = new Date()): number {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((startOfTarget.getTime() - startOfToday.getTime()) / msPerDay);
}

/** "11 Sep" — the compact form used in the due-date chips. */
export function formatDueDate(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Roll-up for the `4A · B2B` card header. */
export function b2bSectionTotals(b2b: ReadonlyArray<Gstr1B2bEntry>) {
  return b2b.reduce(
    (totals, entry) => ({
      buyers: totals.buyers + 1,
      invoiceCount: totals.invoiceCount + entry.invoiceCount,
      totalTaxable: totals.totalTaxable + entry.totalTaxable,
      totalTax: totals.totalTax + entry.totalTax,
    }),
    { buyers: 0, invoiceCount: 0, totalTaxable: 0, totalTax: 0 },
  );
}

/** Total row beneath the GSTR-3B `3.1` rate breakdown. */
export function outwardSupplyTotals(
  supplies: ReadonlyArray<Gstr3bOutwardSupply>,
) {
  return supplies.reduce(
    (totals, row) => ({
      taxableValue: totals.taxableValue + row.taxableValue,
      cgst: totals.cgst + row.cgst,
      sgst: totals.sgst + row.sgst,
      igst: totals.igst + row.igst,
      totalTax: totals.totalTax + row.totalTax,
    }),
    { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 },
  );
}
