import { InvoiceStatus } from '@prisma/client';
import { summarizeDocumentSeries } from './document-series.util';

const doc = (
  invoiceNumber: string,
  over: Partial<{ status: InvoiceStatus; creditNoteForId: string | null }> = {},
) => ({
  invoiceNumber,
  status: InvoiceStatus.ISSUED,
  creditNoteForId: null,
  ...over,
});

/**
 * GSTR-1 Table 13 declares the serial ranges a business issued in the period.
 * It is derived entirely from the invoice numbers — there is no sequence column
 * — so every quirk of the numbering format is this function's problem.
 */
describe('summarizeDocumentSeries', () => {
  it('reports a gapless run as one range', () => {
    const { rows, unparsed } = summarizeDocumentSeries([
      doc('INV-26-27/000001'),
      doc('INV-26-27/000002'),
      doc('INV-26-27/000003'),
    ]);

    expect(unparsed).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      nature: 'Invoices for outward supply',
      series: 'INV',
      from: '000001',
      to: '000003',
      total: 3,
      documents: 3,
      cancelled: 0,
      netIssued: 3,
    });
  });

  it('counts a cancelled document inside the range, and nets it out', () => {
    // A cancelled invoice keeps its number — the slot is consumed, which is
    // exactly what keeps the run gapless and what Table 13 asks about.
    const { rows } = summarizeDocumentSeries([
      doc('INV-26-27/000001'),
      doc('INV-26-27/000002', { status: InvoiceStatus.CANCELLED }),
      doc('INV-26-27/000003'),
    ]);

    expect(rows[0]).toMatchObject({ total: 3, cancelled: 1, netIssued: 2 });
  });

  it('treats both financial-year spellings as one series', () => {
    // The number was shortened from INV-2026-27/... to INV-26-27/... to fit the
    // 16-character cap, deliberately without a gap. Reporting two ranges would
    // misrepresent one continuous run.
    const { rows } = summarizeDocumentSeries([
      doc('INV-2026-27/000001'),
      doc('INV-26-27/000002'),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ from: '000001', to: '000002', total: 2 });
  });

  it('keeps two financial years apart even in one window', () => {
    // The return window is a date range, not an FY, so an April period holds
    // the tail of one year's run and the head of the next. Merging them would
    // report a range spanning nine hundred serials.
    const { rows } = summarizeDocumentSeries([
      doc('INV-25-26/000900'),
      doc('INV-26-27/000001'),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.total)).toEqual([1, 1]);
  });

  it('separates the credit-note series and identifies a cancelled one', () => {
    // A cancelled credit note carries status CANCELLED, so only
    // creditNoteForId still says what it is.
    const { rows } = summarizeDocumentSeries([
      doc('INV-26-27/000001'),
      doc('CN-26-27/000001', { status: InvoiceStatus.CREDIT_NOTE }),
      doc('CN-26-27/000002', {
        status: InvoiceStatus.CANCELLED,
        creditNoteForId: 'inv_1',
      }),
    ]);

    const notes = rows.find((r) => r.series === 'CN')!;
    expect(notes.nature).toBe('Credit note');
    expect(notes).toMatchObject({ total: 2, cancelled: 1, netIssued: 1 });
    expect(rows.find((r) => r.series === 'INV')!.nature).toBe(
      'Invoices for outward supply',
    );
  });

  it('reports a serial gap instead of hiding it', () => {
    const { rows } = summarizeDocumentSeries([
      doc('INV-26-27/000001'),
      doc('INV-26-27/000005'),
    ]);

    // The span is five; only two documents explain it. Both numbers are shown
    // so the discrepancy is visible rather than averaged away.
    expect(rows[0]).toMatchObject({ total: 5, documents: 2 });
  });

  it('counts an unreadable number rather than throwing or guessing', () => {
    const { rows, unparsed } = summarizeDocumentSeries([
      doc('INV-26-27/000001'),
      doc('LEGACY-INVOICE'),
      doc('INV-26-27/ABC'),
    ]);

    expect(unparsed).toBe(2);
    expect(rows).toHaveLength(1);
    expect(rows[0].documents).toBe(1);
  });
});
