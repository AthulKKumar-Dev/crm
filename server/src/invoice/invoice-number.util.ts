/**
 * Shape of a statutory document number.
 *
 * Rule 46(b) of the CGST Rules caps an invoice number at SIXTEEN characters,
 * drawn from letters, digits, hyphen and slash, and requires it to be a
 * consecutive serial unique within the financial year.
 *
 * The original format spent 18 characters — `INV-2026-27/000003` — because the
 * financial year was written in full. The century adds nothing a reader cannot
 * infer, so it is dropped: `INV-26-27/000003` is exactly 16 and leaves room for
 * a merchant's own three-character series prefix (`SJ-26-27/000001`, 15).
 *
 * The stored `Invoice.financialYear` COLUMN keeps the long form. Only the
 * printed number shortens. GST returns, period locking and the reporting
 * filters all read that column, so none of them are affected.
 *
 * Changing the format does NOT break the running series. The sequence is read
 * back with `MAX(split_part(invoice_number, '/', 2))` filtered by
 * `invoice_number LIKE '<prefix>-%'`, and both the old and new forms share the
 * prefix and the `/`-delimited numeric tail — so the next number after
 * `INV-2026-27/000003` is `INV-26-27/000004`, with no gap and no restart.
 */

/** Rule 46(b): an invoice number may not exceed sixteen characters. */
export const MAX_INVOICE_NUMBER_LENGTH = 16;

/**
 * Longest series prefix that still fits.
 *
 * 16 = prefix + "-" + "26-27" (5) + "/" + six padded digits, so the prefix gets
 * 3. `INV` and `CN` both fit, and it is enough for the two- or three-letter
 * house codes merchants actually use.
 */
export const MAX_SERIES_PREFIX_LENGTH = 3;

/** The built-in series. Each is its own gapless, consecutive statutory run. */
export const DEFAULT_INVOICE_PREFIX = 'INV';
export const CREDIT_NOTE_PREFIX = 'CN';

/** Letters and digits only: a hyphen or slash would collide with the separators. */
export const SERIES_PREFIX_REGEX = /^[A-Z0-9]{1,3}$/;

/**
 * Canonical form of a merchant-supplied series prefix, or null when it is not
 * usable. Trims and uppercases first, so "sj " is accepted as "SJ".
 */
export function normalizeSeriesPrefix(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toUpperCase();
  return SERIES_PREFIX_REGEX.test(candidate) ? candidate : null;
}

/**
 * The invoice series prefix for an organization: whatever it configured, or
 * `INV`. Falls back rather than throwing — a stored value that no longer
 * passes validation must not stop the org invoicing.
 */
export function resolveInvoicePrefix(configured: unknown): string {
  const normalized = normalizeSeriesPrefix(configured);
  // Never let the invoice series collide with the credit-note series: one
  // MAX(sequence) would then span both and permanently gap the invoice run.
  if (!normalized || normalized === CREDIT_NOTE_PREFIX) return DEFAULT_INVOICE_PREFIX;
  return normalized;
}

/**
 * "2026-27" → "26-27". Any other shape is passed through untouched, so a
 * legacy or unexpected value still produces a number rather than throwing.
 */
export function shortFinancialYear(financialYear: string): string {
  const match = /^(\d{2})(\d{2})-(\d{2})$/.exec(financialYear);
  return match ? `${match[2]}-${match[3]}` : financialYear;
}

/** `SJ-26-27/000001`. Sequence pads to six and simply grows past it. */
export function buildDocumentNumber(
  prefix: string,
  financialYear: string,
  sequence: number,
): string {
  return `${prefix}-${shortFinancialYear(financialYear)}/${String(sequence).padStart(6, '0')}`;
}
