/**
 * Response headers an export uses to say how much of the result it carries.
 *
 * Exports are capped (the file is built in memory), and a capped file that
 * does not say so reads as complete. The client compares the two and warns.
 *
 * Both must be listed in the CORS `exposedHeaders` (main.ts): the app and the
 * API are on different origins, and a browser hides any response header that
 * is not exposed — the warning would silently never fire.
 */
export const EXPORT_ROWS_HEADER = 'X-Export-Rows';
export const EXPORT_TOTAL_HEADER = 'X-Export-Total';

export const EXPORT_EXPOSED_HEADERS = [EXPORT_ROWS_HEADER, EXPORT_TOTAL_HEADER];
