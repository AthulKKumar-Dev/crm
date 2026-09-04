import { extractStateFromAddress } from '../gst/place-of-supply.util';

/** Shopify's location address block, as fetched by LOCATIONS_QUERY. */
export interface ShopifyLocationAddress {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  provinceCode?: string | null;
  zip?: string | null;
  country?: string | null;
  countryCode?: string | null;
  phone?: string | null;
}

/**
 * Shopify's location address → the canonical address blob the rest of the
 * system stores.
 *
 * Two readers have to agree on the result: `extractStateFromAddress` on the
 * server (which reads `province_code` / `provinceCode` / `stateCode`) and
 * `readAddress` on the client (which renders `address1`, `address2`, `city`,
 * `zip`, `province`). So both notations are written — `provinceCode` for the
 * former, `province` for the latter — plus a resolved `stateCode`, which is the
 * only one the GST code should ever have to trust.
 *
 * Returns null when the location carries nothing worth storing, so callers can
 * distinguish "Shopify had no address" from "an empty object was written".
 */
export function toWarehouseAddress(
  address: ShopifyLocationAddress | null | undefined,
): Record<string, unknown> | null {
  if (!address) return null;

  const text = (value: string | null | undefined): string | undefined => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed || undefined;
  };

  const result: Record<string, unknown> = {};
  const assign = (key: string, value: string | undefined) => {
    if (value) result[key] = value;
  };

  assign('address1', text(address.address1));
  assign('address2', text(address.address2));
  assign('city', text(address.city));
  assign('zip', text(address.zip));
  assign('province', text(address.province));
  assign('provinceCode', text(address.provinceCode));
  assign('country', text(address.country));
  assign('countryCode', text(address.countryCode));
  assign('phone', text(address.phone));

  if (Object.keys(result).length === 0) return null;

  const stateCode = extractStateFromAddress(result);
  if (stateCode) result.stateCode = stateCode;

  return result;
}
