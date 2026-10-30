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

/**
 * ISO-2 country of an address bag, or null. Addresses are untyped JSON:
 * Shopify's `country_code`, or the same key written by the CRM address form.
 */
export function countryCodeOf(address: unknown): string | null {
    if (!address || typeof address !== 'object') return null;
    const a = address as Record<string, unknown>;
    const code = a.country_code ?? a.countryCode;
    return typeof code === 'string' && code.trim() ? code.trim().toUpperCase() : null;
}

/**
 * Every stored form a phone may already exist under, for matching an
 * existing customer. The order form now sends E.164 ("+919847586793") while
 * older customers were saved as typed ("9847586793"), so an exact match on
 * either would miss the other and create a duplicate customer.
 */
export function phoneLookupVariants(raw: string, countryCode?: string | null): string[] {
    const variants = new Set<string>([raw]);
    const e164 = normalizePhone(raw, countryCode);
    if (e164) {
        variants.add(e164);
        const national = parsePhoneNumberFromString(e164)?.nationalNumber;
        if (national) variants.add(String(national));
    }
    return [...variants];
}
