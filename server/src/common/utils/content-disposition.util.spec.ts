import {
  attachmentDisposition,
  safeFilename,
} from './content-disposition.util';

/**
 * The GST return export interpolates two user-supplied query values — financial
 * year and period — into its Content-Disposition filename, and did so unquoted.
 * If this is wrong the merchant either cannot save the file (a space truncates
 * the name) or the caller gets to append header parameters of their own.
 */
describe('attachmentDisposition', () => {
  it('always quotes the filename', () => {
    expect(attachmentDisposition('GSTR1-2025-26-04.csv')).toBe(
      'attachment; filename="GSTR1-2025-26-04.csv"',
    );
  });

  it('strips a quote-and-semicolon injection attempt down to one parameter', () => {
    const header = attachmentDisposition('GSTR1-2025-26-04"; filename="evil.sh');

    // Exactly one `filename=`, and no stray quote or semicolon inside the value.
    expect(header.match(/filename=/g)).toHaveLength(1);
    expect(header).toBe(
      'attachment; filename="GSTR1-2025-26-04-filename-evil.sh"',
    );
  });

  it('leaves no CR or LF for header splitting', () => {
    const header = attachmentDisposition('a\r\nX-Injected: 1');

    expect(header).not.toMatch(/[\r\n]/);
  });

  it('falls back rather than emitting an empty filename', () => {
    // A name made entirely of stripped characters would otherwise render
    // `filename=""`, which browsers handle inconsistently.
    expect(safeFilename('///', 'gst-return.csv')).toBe('gst-return.csv');
    expect(attachmentDisposition('', 'invoices.csv')).toBe(
      'attachment; filename="invoices.csv"',
    );
  });

  it('does not begin the name with a dot', () => {
    // ".csv" is a hidden file on unix and confuses the download dialog.
    expect(safeFilename('...csv')).toBe('csv');
  });

  it('caps length so a long search term cannot bloat the header', () => {
    expect(safeFilename('a'.repeat(500)).length).toBe(100);
  });
});
