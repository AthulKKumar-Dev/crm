/**
 * Statutory GST rate slabs in India (percentages).
 *
 * 0.25% (rough/semi-precious diamonds) and 3% (gold, silver, jewellery) are
 * real, legal slabs and were missing from this list. That was harmless while
 * the constant was unused, but it is now ENFORCED on the tax-rate DTOs — and
 * enforcing the shorter list would have made a jewellery merchant unable to
 * save their correct rate, turning a validation improvement into a data-entry
 * bug.
 */
export const GST_RATE_SLABS = [0, 0.25, 3, 5, 12, 18, 28] as const;

export type GstRateSlab = (typeof GST_RATE_SLABS)[number];

/**
 * GSTIN regex pattern for validation
 * Format: 2-digit state code + 10-char PAN + 1 entity code + Z + 1 check digit
 * Example: 27AABCU9603R1ZM
 */
export const GSTIN_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** True for a syntactically valid GSTIN. Trims and upper-cases first. */
export function isValidGstin(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  return GSTIN_REGEX.test(value.trim().toUpperCase());
}

/** Canonical storage form for a GSTIN, or null when it is not one. */
export function normalizeGstin(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toUpperCase();
  return GSTIN_REGEX.test(candidate) ? candidate : null;
}

/** True when `rate` is one of the statutory slabs. */
export function isGstRateSlab(rate: number): boolean {
  return (GST_RATE_SLABS as readonly number[]).includes(rate);
}

/**
 * Extract the state code from a GSTIN, or null if the value is not a GSTIN.
 *
 * Previously a bare `substring(0, 2)`, which happily returned "ga" for the
 * string "garbage" and fed it into place-of-supply resolution as a state code.
 */
export function extractStateCodeFromGstin(
  gstin: string | null | undefined,
): string | null {
  const normalized = normalizeGstin(gstin);
  return normalized ? normalized.substring(0, 2) : null;
}
