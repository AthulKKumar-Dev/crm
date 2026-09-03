import {
  CREDIT_NOTE_PREFIX,
  DEFAULT_INVOICE_PREFIX,
  MAX_INVOICE_NUMBER_LENGTH,
  buildDocumentNumber,
  normalizeSeriesPrefix,
  resolveInvoicePrefix,
  shortFinancialYear,
} from './invoice-number.util';

/**
 * Invoice numbering is statutory: Rule 46(b) caps the number at sixteen
 * characters and requires a consecutive series. Both are easy to break with a
 * one-character change here, and neither failure is visible until an audit.
 */

describe('shortFinancialYear', () => {
  it('drops the century from a full financial year', () => {
    expect(shortFinancialYear('2026-27')).toBe('26-27');
    expect(shortFinancialYear('2025-26')).toBe('25-26');
  });

  it('passes an unrecognised value through rather than throwing', () => {
    // A legacy or hand-written value must still produce a number.
    expect(shortFinancialYear('26-27')).toBe('26-27');
    expect(shortFinancialYear('')).toBe('');
  });
});

describe('buildDocumentNumber', () => {
  it('stays within the sixteen-character statutory limit', () => {
    const widest = buildDocumentNumber('INV', '2026-27', 999999);
    expect(widest).toBe('INV-26-27/999999');
    expect(widest.length).toBe(MAX_INVOICE_NUMBER_LENGTH);
  });

  it('leaves room for a shorter merchant prefix', () => {
    const number = buildDocumentNumber('SJ', '2026-27', 1);
    expect(number).toBe('SJ-26-27/000001');
    expect(number.length).toBeLessThanOrEqual(MAX_INVOICE_NUMBER_LENGTH);
  });

  it('pads to six digits and grows beyond rather than truncating', () => {
    expect(buildDocumentNumber('INV', '2026-27', 42)).toBe('INV-26-27/000042');
    expect(buildDocumentNumber('INV', '2026-27', 1234567)).toBe('INV-26-27/1234567');
  });

  it('keeps the separators the sequence reader depends on', () => {
    // The next number is found with split_part(invoice_number, '/', 2) and a
    // LIKE '<prefix>-%' filter. Lose either separator and numbering restarts.
    const number = buildDocumentNumber('SJ', '2026-27', 7);
    expect(number.startsWith('SJ-')).toBe(true);
    expect(number.split('/')[1]).toBe('000007');
  });

  it('continues the same series as the old longer format', () => {
    // Both forms share the prefix and the numeric tail, so MAX() spans them.
    const old = 'INV-2026-27/000003';
    const next = buildDocumentNumber('INV', '2026-27', 4);
    expect(old.startsWith('INV-')).toBe(true);
    expect(next.startsWith('INV-')).toBe(true);
    expect(Number(old.split('/')[1]) + 1).toBe(Number(next.split('/')[1]));
  });
});

describe('normalizeSeriesPrefix', () => {
  it('trims and uppercases', () => {
    expect(normalizeSeriesPrefix(' sj ')).toBe('SJ');
    expect(normalizeSeriesPrefix('inv')).toBe('INV');
  });

  it('accepts one to three letters or digits', () => {
    expect(normalizeSeriesPrefix('A')).toBe('A');
    expect(normalizeSeriesPrefix('AB1')).toBe('AB1');
  });

  it('rejects anything that would collide with the separators or overflow', () => {
    expect(normalizeSeriesPrefix('SJ-1')).toBeNull();
    expect(normalizeSeriesPrefix('SJ/1')).toBeNull();
    expect(normalizeSeriesPrefix('ABCD')).toBeNull();
    expect(normalizeSeriesPrefix('')).toBeNull();
    expect(normalizeSeriesPrefix('S J')).toBeNull();
    expect(normalizeSeriesPrefix(null)).toBeNull();
    expect(normalizeSeriesPrefix(42)).toBeNull();
  });
});

describe('resolveInvoicePrefix', () => {
  it('uses the configured series when it is valid', () => {
    expect(resolveInvoicePrefix('SJ')).toBe('SJ');
    expect(resolveInvoicePrefix(' sj ')).toBe('SJ');
  });

  it('falls back to INV rather than blocking invoicing on a bad stored value', () => {
    expect(resolveInvoicePrefix(undefined)).toBe(DEFAULT_INVOICE_PREFIX);
    expect(resolveInvoicePrefix('')).toBe(DEFAULT_INVOICE_PREFIX);
    expect(resolveInvoicePrefix('TOOLONG')).toBe(DEFAULT_INVOICE_PREFIX);
  });

  it('refuses to reuse the credit-note series', () => {
    // Sharing a prefix would make one MAX(sequence) span both document types
    // and permanently gap the invoice run.
    expect(resolveInvoicePrefix(CREDIT_NOTE_PREFIX)).toBe(DEFAULT_INVOICE_PREFIX);
    expect(resolveInvoicePrefix('cn')).toBe(DEFAULT_INVOICE_PREFIX);
  });
});
