import { InvoiceStatus } from '@prisma/client';

/** One row of GSTR-1 Table 13 — documents issued. */
export interface Gstr1DocumentSeriesRow {
  /** Statutory nature-of-document label. */
  nature: string;
  /** Series prefix as issued, e.g. "INV" or "CN". */
  series: string;
  /** Short financial year the run belongs to, e.g. "26-27". */
  financialYear: string;
  /** Lowest and highest serial seen in this period. */
  from: string;
  to: string;
  /** to − from + 1: the span the serials cover. */
  total: number;
  /** Rows actually present. Differs from `total` only when serials are missing. */
  documents: number;
  cancelled: number;
  /** total − cancelled, as the portal computes it. */
  netIssued: number;
}

export interface DocumentSeriesSummary {
  rows: Gstr1DocumentSeriesRow[];
  /** Numbers that carried no readable serial. Never silently dropped. */
  unparsed: number;
}

export interface DocumentSeriesInput {
  invoiceNumber: string;
  status: InvoiceStatus;
  creditNoteForId: string | null;
}

const NATURE_INVOICE = 'Invoices for outward supply';
const NATURE_CREDIT_NOTE = 'Credit note';

/**
 * Split "INV-26-27/000004" into its series, financial year and serial.
 *
 * Parsed exactly the way `InvoiceNumberService.compute` reads it back — serial
 * is the text after the LAST '/', and only when it is all digits. Anything else
 * is unparsed rather than guessed at.
 *
 * TWO FY SPELLINGS EXIST IN ONE RUN. The original production format was
 * `INV-2026-27/000003`; the number was later shortened to `INV-26-27/000004` to
 * fit Rule 46(b)'s 16 characters, deliberately WITHOUT a gap. Both spellings
 * therefore belong to the same series and are normalised to the short one —
 * otherwise a merchant who was invoicing across that change would see their one
 * gapless run reported as two.
 */
function parseDocumentNumber(
  invoiceNumber: string,
): { series: string; financialYear: string; sequence: number } | null {
  const slash = invoiceNumber.lastIndexOf('/');
  if (slash === -1) return null;

  const serial = invoiceNumber.slice(slash + 1);
  if (!/^\d+$/.test(serial)) return null;

  const head = invoiceNumber.slice(0, slash);
  const dash = head.indexOf('-');
  if (dash === -1) return null;

  const series = head.slice(0, dash);
  const rawFy = head.slice(dash + 1);
  if (!series || !rawFy) return null;

  // "2026-27" → "26-27"; "26-27" is already canonical.
  const financialYear = /^\d{4}-\d{2}$/.test(rawFy) ? rawFy.slice(2) : rawFy;

  return { series, financialYear, sequence: Number(serial) };
}

/**
 * GSTR-1 Table 13 — the serial ranges of every document series issued in the
 * period, with how many were cancelled.
 *
 * Grouped by series AND financial year, not by series alone: the return window
 * is a date range, not an FY, so an April period legitimately contains the tail
 * of last year's run and the head of this year's. Grouping on the prefix alone
 * would report those as one range spanning nine hundred serials.
 *
 * Nature comes from the ROW, never the prefix — a cancelled credit note carries
 * `status: CANCELLED`, so only `creditNoteForId` still identifies it.
 *
 * `total` (the serial span) and `documents` (rows present) are both reported.
 * They diverge when serials are missing from the window, which is either a
 * genuine gap worth investigating, or the expected consequence of scoping the
 * return to one GSTIN while the numbering series is shared across the org.
 */
export function summarizeDocumentSeries(
  invoices: DocumentSeriesInput[],
): DocumentSeriesSummary {
  const groups = new Map<
    string,
    {
      nature: string;
      series: string;
      financialYear: string;
      min: number;
      max: number;
      width: number;
      documents: number;
      cancelled: number;
    }
  >();
  let unparsed = 0;

  for (const invoice of invoices) {
    const parsed = parseDocumentNumber(invoice.invoiceNumber);
    if (!parsed) {
      unparsed += 1;
      continue;
    }

    const isCreditNote =
      invoice.status === InvoiceStatus.CREDIT_NOTE ||
      invoice.creditNoteForId !== null;
    const key = `${parsed.series}|${parsed.financialYear}`;
    const serialWidth = invoice.invoiceNumber.length - invoice.invoiceNumber.lastIndexOf('/') - 1;

    const group = groups.get(key) ?? {
      nature: isCreditNote ? NATURE_CREDIT_NOTE : NATURE_INVOICE,
      series: parsed.series,
      financialYear: parsed.financialYear,
      min: parsed.sequence,
      max: parsed.sequence,
      width: serialWidth,
      documents: 0,
      cancelled: 0,
    };

    group.min = Math.min(group.min, parsed.sequence);
    group.max = Math.max(group.max, parsed.sequence);
    group.width = Math.max(group.width, serialWidth);
    group.documents += 1;
    if (invoice.status === InvoiceStatus.CANCELLED) group.cancelled += 1;

    groups.set(key, group);
  }

  const pad = (value: number, width: number) => String(value).padStart(width, '0');

  const rows = Array.from(groups.values())
    .map((group) => {
      const total = group.max - group.min + 1;
      return {
        nature: group.nature,
        series: group.series,
        financialYear: group.financialYear,
        from: pad(group.min, group.width),
        to: pad(group.max, group.width),
        total,
        documents: group.documents,
        cancelled: group.cancelled,
        netIssued: total - group.cancelled,
      };
    })
    .sort(
      (a, b) =>
        a.nature.localeCompare(b.nature) ||
        a.series.localeCompare(b.series) ||
        a.financialYear.localeCompare(b.financialYear),
    );

  return { rows, unparsed };
}
