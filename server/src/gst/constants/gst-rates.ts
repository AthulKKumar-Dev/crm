/**
 * Standard GST rate slabs in India (in percentage)
 */
export const GST_RATE_SLABS = [0, 5, 12, 18, 28] as const;

export type GstRateSlab = (typeof GST_RATE_SLABS)[number];

/**
 * GSTIN regex pattern for validation
 * Format: 2-digit state code + 10-char PAN + 1 entity code + Z + 1 check digit
 * Example: 27AABCU9603R1ZM
 */
export const GSTIN_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Extract state code from a GSTIN string
 */
export function extractStateCodeFromGstin(gstin: string): string {
  return gstin.substring(0, 2);
}
