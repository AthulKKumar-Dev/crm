import { MailingAddressInput } from './shopify-graphql.types';
import { extractStateFromAddress, stateCodeToProvinceCode } from '../gst/place-of-supply.util';
import { countryCodeOf, normalizePhone } from '../common/phone.util';

/**
 * A stored order/draft address as Shopify's `MailingAddressInput`, or
 * undefined when there is nothing worth sending.
 *
 * Neither the order push nor the draft mirror sent addresses at all, so a
 * delivery address entered in the CRM never reached Shopify — and a draft
 * completed in Shopify became an order with no address, which is what the
 * CRM then synced back.
 *
 * Addresses are stored in two notations: the CRM form's (`stateCode: "32"`,
 * `country_code`) and Shopify's (`province_code: "KL"`). The 2026-01 input
 * wants `provinceCode`/`countryCode` (`province`/`country` are deprecated)
 * and an E.164 phone, which Shopify validates — an invalid one is dropped
 * rather than failing the whole order.
 */
export function toShopifyAddress(
  raw: unknown,
  /**
   * Country to send when the address names none. Without one Shopify falls
   * back to the STORE's country — a US dev store turned an Indian address
   * into "United States", which came back as a foreign address and made the
   * order an export (place of supply 96). See `defaultCountryFor`.
   */
  defaultCountry?: string | null,
): MailingAddressInput | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const a = raw as Record<string, unknown>;
  const text = (key: string): string | undefined => {
    const v = a[key];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };

  const address1 = text('address1');
  const city = text('city');
  if (!address1 && !city) return undefined;

  const gstState = extractStateFromAddress(a);
  const provinceCode =
    text('province_code') ?? text('provinceCode') ?? (gstState ? stateCodeToProvinceCode(gstState) : null) ?? undefined;
  const countryCode = countryCodeOf(a) ?? (gstState ? 'IN' : defaultCountry ?? undefined);
  const phone = normalizePhone(text('phone'), countryCode) ?? undefined;

  const out: MailingAddressInput = {
    firstName: text('first_name'),
    lastName: text('last_name'),
    company: text('company'),
    address1,
    address2: text('address2'),
    city,
    zip: text('zip'),
    provinceCode,
    countryCode,
    phone,
  };
  for (const key of Object.keys(out) as (keyof MailingAddressInput)[]) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

/**
 * The country an address with none belongs to, from the order's currency.
 * Organisations have no country column; the CRM's order form only captures
 * Indian addresses, and an INR order is an Indian sale. Other currencies
 * return null — better to let Shopify decide than to guess a country.
 */
export function defaultCountryFor(currency: string | null | undefined): string | null {
  return currency?.toUpperCase() === 'INR' ? 'IN' : null;
}
