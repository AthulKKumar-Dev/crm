/**
 * Unit Quantity Codes (UQC) accepted by the GST portal.
 *
 * GSTR-1 Table 12 requires a UQC on every HSN summary row, and the portal
 * rejects anything outside this list — a free-text "pieces" or "each" fails the
 * upload, which is why this is an allowlist and not a string field.
 *
 * NOT to be confused with `ProductVariant.weightUnit` ('g' | 'kg' | 'oz' | 'lb'),
 * which is a Shopify shipping weight pushed back to Shopify. A product weighed
 * in kilograms for delivery may still be *sold* in NOS.
 */
export const UQC_CODES = [
    'BAG', // BAGS
    'BAL', // BALE
    'BDL', // BUNDLES
    'BKL', // BUCKLES
    'BOU', // BILLIONS OF UNITS
    'BOX', // BOX
    'BTL', // BOTTLES
    'BUN', // BUNCHES
    'CAN', // CANS
    'CBM', // CUBIC METERS
    'CCM', // CUBIC CENTIMETERS
    'CMS', // CENTIMETERS
    'CTN', // CARTONS
    'DOZ', // DOZENS
    'DRM', // DRUMS
    'GGK', // GREAT GROSS
    'GMS', // GRAMMES
    'GRS', // GROSS
    'GYD', // GROSS YARDS
    'KGS', // KILOGRAMS
    'KLR', // KILOLITRE
    'KME', // KILOMETRE
    'MLT', // MILLILITRE
    'MTR', // METERS
    'MTS', // METRIC TON
    'NOS', // NUMBERS
    'PAC', // PACKS
    'PCS', // PIECES
    'PRS', // PAIRS
    'QTL', // QUINTAL
    'ROL', // ROLLS
    'SET', // SETS
    'SQF', // SQUARE FEET
    'SQM', // SQUARE METERS
    'SQY', // SQUARE YARDS
    'TBS', // TABLETS
    'TGM', // TEN GROSS
    'THD', // THOUSANDS
    'TON', // TONNES
    'TUB', // TUBES
    'UGS', // US GALLONS
    'UNT', // UNITS
    'VLS', // VIALS
    'WGS', // WINCHESTER GALLONS
    'YDS', // YARDS
    'OTH', // OTHERS
] as const;

export type UqcCode = (typeof UQC_CODES)[number];

/**
 * Fallback when neither the product nor the organization specifies one.
 *
 * NOS ("numbers") is the correct UQC for anything sold by count, which is the
 * overwhelming majority of retail. It is a defensible default rather than a
 * guess — the alternative, emitting nothing, makes every Table 12 row invalid.
 */
export const DEFAULT_UQC: UqcCode = 'NOS';

export function isUqcCode(value: string | null | undefined): boolean {
    if (typeof value !== 'string') return false;
    return (UQC_CODES as readonly string[]).includes(value.trim().toUpperCase());
}

/** Canonical stored form, or null when it is not a valid UQC. */
export function normalizeUqc(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const candidate = value.trim().toUpperCase();
    return (UQC_CODES as readonly string[]).includes(candidate) ? candidate : null;
}
