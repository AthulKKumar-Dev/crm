import { isValidStateCode } from './constants/indian-states';
import { extractStateCodeFromGstin } from './constants/gst-rates';

/**
 * Single source of truth for GST place of supply.
 *
 * Previously the order and the invoice each derived this independently and
 * could disagree — the order never looked at addresses at all, while the
 * invoice preferred them, so the same sale could be taxed CGST+SGST on the
 * order and IGST on its invoice. Worse, the invoice's chain bottomed out at
 * '00', which matches no StateTaxRate row, so a plain walk-in could be charged
 * full tax on the order and 0% on the statutory invoice.
 *
 * Resolution order (goods): an explicit code wins; otherwise the delivery
 * address decides (Section 10(1)(a) — location of the goods at delivery);
 * otherwise the buyer's own recorded state; otherwise the seller's state,
 * which is the correct default for over-the-counter supply.
 */

/** Shopify province code → Indian GST state code. */
const PROVINCE_TO_STATE_CODE: Record<string, string> = {
  AN: '35', AP: '37', AR: '12', AS: '18', BR: '10',
  CG: '22', CH: '04', DD: '26', DL: '07', GA: '30',
  GJ: '24', HP: '02', HR: '06', JH: '20', JK: '01',
  KA: '29', KL: '32', LA: '38', LD: '31', MH: '27',
  ML: '17', MN: '14', MP: '23', MZ: '15', NL: '13',
  OR: '21', PB: '03', PY: '34', RJ: '08', SK: '11',
  TN: '33', TS: '36', UK: '05', UP: '09', WB: '19',
};

/** State code from an address JSON blob, or null when it carries none. */
export function extractStateFromAddress(address: unknown): string | null {
  if (!address || typeof address !== 'object') return null;

  const a = address as Record<string, unknown>;

  // Shopify format: province_code (e.g. "MH").
  if (typeof a.province_code === 'string' && a.province_code) {
    return PROVINCE_TO_STATE_CODE[a.province_code] ?? null;
  }
  // Locally-entered format.
  if (typeof a.provinceCode === 'string' && a.provinceCode) {
    return PROVINCE_TO_STATE_CODE[a.provinceCode] ?? null;
  }
  if (typeof a.stateCode === 'string' && isValidStateCode(a.stateCode)) {
    return a.stateCode;
  }

  return null;
}

export interface PlaceOfSupplyInput {
  /** Caller-supplied override; only honoured when it is a real state code. */
  explicitCode?: string | null;
  shippingAddress?: unknown;
  billingAddress?: unknown;
  customerBillingStateCode?: string | null;
  buyerGstin?: string | null;
  /** Seller's GSTIN state — the over-the-counter default. */
  sellerStateCode?: string | null;
}

/**
 * Resolve the place-of-supply state code. Returns '00' only when the caller
 * supplied nothing usable at all — including no seller state.
 */
export function resolvePlaceOfSupply(input: PlaceOfSupplyInput): string {
  if (input.explicitCode && isValidStateCode(input.explicitCode)) {
    return input.explicitCode;
  }

  const shippingState = extractStateFromAddress(input.shippingAddress);
  if (shippingState) return shippingState;

  const billingState = extractStateFromAddress(input.billingAddress);
  if (billingState) return billingState;

  if (
    input.customerBillingStateCode &&
    isValidStateCode(input.customerBillingStateCode)
  ) {
    return input.customerBillingStateCode;
  }

  if (input.buyerGstin) {
    const fromGstin = extractStateCodeFromGstin(input.buyerGstin);
    if (fromGstin && isValidStateCode(fromGstin)) return fromGstin;
  }

  // Over-the-counter supply: the goods change hands at the seller's location.
  // This step is what stops a walk-in invoice from resolving to '00' and
  // silently computing 0% tax while the order charged the full rate.
  if (input.sellerStateCode && isValidStateCode(input.sellerStateCode)) {
    return input.sellerStateCode;
  }

  return '00';
}
