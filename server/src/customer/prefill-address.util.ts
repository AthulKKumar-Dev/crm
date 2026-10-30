import { extractStateFromAddress } from '../gst/place-of-supply.util';
import { getStateName } from '../gst/constants/indian-states';
import { countryCodeOf, normalizePhone } from '../common/phone.util';

/**
 * The address the order form pre-fills when an existing customer is picked,
 * in the form's own `OrderAddressInput` shape.
 *
 * Stored addresses come in two notations: Shopify's (`province_code: "KL"`,
 * no GST code) on synced customers, and the CRM form's (`stateCode: "32"`,
 * `province`) on orders. The form's state picker needs the 2-digit GST code —
 * it decides CGST+SGST vs IGST — so both are resolved through
 * `extractStateFromAddress`, the same function place of supply uses.
 */
export interface PrefillAddress {
  first_name?: string;
  last_name?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  stateCode?: string;
  zip?: string;
  country?: string;
  country_code?: string;
  phone?: string;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function toPrefillAddress(
  raw: unknown,
  customer: { firstName: string | null; lastName: string | null },
): PrefillAddress | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;

  const stateCode = extractStateFromAddress(a) ?? undefined;
  const address1 = text(a.address1);
  const city = text(a.city);
  // Nothing a merchant would recognise as an address.
  if (!address1 && !city && !stateCode) return null;

  const countryCode = countryCodeOf(a) ?? (stateCode ? 'IN' : undefined);
  const phone = normalizePhone(text(a.phone), countryCode) ?? undefined;

  const out: PrefillAddress = {
    first_name: text(a.first_name) ?? text(customer.firstName),
    last_name: text(a.last_name) ?? text(customer.lastName),
    company: text(a.company),
    address1,
    address2: text(a.address2),
    city,
    zip: text(a.zip),
    stateCode,
    province: (stateCode && getStateName(stateCode)) || text(a.province),
    country: text(a.country) ?? (countryCode === 'IN' ? 'India' : undefined),
    country_code: countryCode,
    phone,
  };
  // Drop empty keys so the form sees exactly what is known.
  for (const key of Object.keys(out) as (keyof PrefillAddress)[]) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

/** First usable address among the candidates, in priority order. */
export function pickPrefillAddress(
  candidates: unknown[],
  customer: { firstName: string | null; lastName: string | null },
): PrefillAddress | null {
  for (const candidate of candidates) {
    const address = toPrefillAddress(candidate, customer);
    if (address) return address;
  }
  return null;
}
