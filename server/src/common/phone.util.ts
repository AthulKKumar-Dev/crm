import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * Normalize a raw phone string to E.164 (e.g., "+919876543210").
 * Returns null if the number is unparseable or invalid.
 *
 * @param raw         The phone number as it arrived from the upstream source
 *                    (Shopify stores numbers unnormalized — could be "+91-98...",
 *                    "(555) 555-5555", "9876543210", etc.).
 * @param countryCode ISO-2 country code (e.g., "IN", "US") used as a hint when
 *                    `raw` doesn't start with +. Typically inferred from the
 *                    order's shipping or billing address.
 */
export function normalizePhone(raw: string | null | undefined, countryCode?: string | null): string | null {
    if (!raw) return null;
    try {
        const parsed = parsePhoneNumberFromString(
            raw,
            (countryCode?.toUpperCase() ?? undefined) as CountryCode | undefined,
        );
        if (!parsed?.isValid()) return null;
        return parsed.number; // always E.164 when parsed.isValid() is true
    } catch {
        return null;
    }
}
