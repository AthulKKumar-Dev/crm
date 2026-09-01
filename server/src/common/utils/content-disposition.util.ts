/**
 * Build a safe `Content-Disposition` attachment header.
 *
 * The CSV exporters interpolate user-supplied query values (financial year,
 * period, and in other controllers a search term) straight into the filename,
 * and did so UNQUOTED. A value containing a space truncates the filename at the
 * space; one containing a quote or semicolon lets the caller append header
 * parameters of their own.
 *
 * Rather than escape, this reduces to a conservative allowlist — filenames here
 * are always machine-generated from ids, dates and periods, so nothing legitimate
 * is lost, and there is no encoding for the browser to disagree about.
 */
const MAX_FILENAME_LENGTH = 100;

export function safeFilename(filename: string, fallback = 'download'): string {
    const cleaned = (filename ?? '')
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        // Leading dots would make a hidden file; runs of separators read as noise.
        .replace(/-{2,}/g, '-')
        .replace(/^[.-]+/, '')
        .slice(0, MAX_FILENAME_LENGTH);

    return cleaned || fallback;
}

/** `attachment; filename="<safe>"` — always quoted. */
export function attachmentDisposition(
    filename: string,
    fallback = 'download',
): string {
    return `attachment; filename="${safeFilename(filename, fallback)}"`;
}
