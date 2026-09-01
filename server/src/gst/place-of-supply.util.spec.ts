import {
  extractStateFromAddress,
  resolvePlaceOfSupply,
} from './place-of-supply.util';

/**
 * Place of supply decides CGST+SGST versus IGST — the tax head printed on a
 * statutory invoice and the section an invoice lands in on GSTR-1. Getting it
 * wrong charges the customer the wrong tax and files it under the wrong head.
 *
 * This is now the single resolver for offline orders, drafts, Shopify sync and
 * invoicing. Before, drafts and the Shopify sync each had their own chain, so a
 * draft could be quoted at one head and complete into an order taxed at another.
 */
describe('extractStateFromAddress', () => {
  it('maps a Shopify province code', () => {
    expect(extractStateFromAddress({ province_code: 'MH' })).toBe('27');
  });

  it('maps the locally-entered camelCase notation', () => {
    expect(extractStateFromAddress({ provinceCode: 'KA' })).toBe('29');
  });

  it('accepts an explicit 2-digit state code', () => {
    expect(extractStateFromAddress({ stateCode: '27' })).toBe('27');
  });

  it('falls THROUGH an unrecognised province code to a usable stateCode', () => {
    // One address is a single fact in several notations. A notation we cannot
    // read is not evidence the fact is missing — each branch used to return
    // early and abandon resolution here.
    expect(
      extractStateFromAddress({ province_code: 'ZZ', stateCode: '29' }),
    ).toBe('29');
  });

  it('returns null for an address carrying no state at all', () => {
    expect(extractStateFromAddress({ city: 'Mumbai' })).toBeNull();
    expect(extractStateFromAddress(null)).toBeNull();
    expect(extractStateFromAddress('Mumbai')).toBeNull();
  });

  it('rejects a state code that is not a real Indian state', () => {
    expect(extractStateFromAddress({ stateCode: '99' })).toBeNull();
  });
});

describe('resolvePlaceOfSupply', () => {
  it('prefers an explicit code above everything else', () => {
    expect(
      resolvePlaceOfSupply({
        explicitCode: '27',
        shippingAddress: { stateCode: '29' },
        sellerStateCode: '19',
      }),
    ).toBe('27');
  });

  it('ignores an explicit code that is not a real state', () => {
    // '99' matches no state, so honouring it would produce an invoice whose
    // place of supply matches no StateTaxRate row.
    expect(
      resolvePlaceOfSupply({ explicitCode: '99', sellerStateCode: '27' }),
    ).toBe('27');
  });

  it('prefers the shipping address over the billing address', () => {
    // Section 10(1)(a): where the supply involves movement of goods, the place
    // of supply is where delivery terminates.
    expect(
      resolvePlaceOfSupply({
        shippingAddress: { stateCode: '29' },
        billingAddress: { stateCode: '27' },
      }),
    ).toBe('29');
  });

  it('falls to billing when there is no shipping address', () => {
    expect(
      resolvePlaceOfSupply({ billingAddress: { province_code: 'MH' } }),
    ).toBe('27');
  });

  it('falls to the customer record when neither address carries a state', () => {
    expect(
      resolvePlaceOfSupply({
        shippingAddress: { city: 'Mumbai' },
        customerBillingStateCode: '29',
      }),
    ).toBe('29');
  });

  it('falls to the buyer GSTIN before the seller state', () => {
    expect(
      resolvePlaceOfSupply({
        buyerGstin: '29AABCU9603R1ZM',
        sellerStateCode: '27',
      }),
    ).toBe('29');
  });

  it('ignores a malformed buyer GSTIN rather than slicing it', () => {
    // The old bare substring produced "ga" from "garbage" and treated it as a
    // state code.
    expect(
      resolvePlaceOfSupply({ buyerGstin: 'garbage', sellerStateCode: '27' }),
    ).toBe('27');
  });

  it('uses the seller state for an over-the-counter sale', () => {
    // A walk-in with no address at all. Returning '00' here matched no
    // StateTaxRate row, so the invoice computed 0% on a sale the order had
    // charged the full rate for.
    expect(resolvePlaceOfSupply({ sellerStateCode: '27' })).toBe('27');
  });

  it('returns 00 only when nothing usable was supplied', () => {
    expect(resolvePlaceOfSupply({})).toBe('00');
    expect(resolvePlaceOfSupply({ sellerStateCode: '99' })).toBe('00');
  });
});

/**
 * Exports.
 *
 * The bug: `extractStateFromAddress` reads only Indian province notations, so a
 * foreign address yielded null, fell through every rung of the chain, and landed
 * on the SELLER OWN STATE — an export invoiced as a local CGST+SGST supply.
 */
describe("resolvePlaceOfSupply — exports", () => {
  it("resolves a foreign shipping address to 96, not the seller state", () => {
    expect(
      resolvePlaceOfSupply({
        shippingAddress: { country_code: "US", city: "Austin" },
        sellerStateCode: "27",
      }),
    ).toBe("96");
  });

  it("accepts the several country key spellings that reach us", () => {
    // Shopify GraphQL gives countryCodeV2; transformAddress emits country_code;
    // offline orders may carry a plain country name.
    for (const address of [
      { countryCodeV2: "AE" },
      { country_code: "GB" },
      { countryCode: "SG" },
      { country: "United States" },
    ]) {
      expect(resolvePlaceOfSupply({ shippingAddress: address, sellerStateCode: "27" })).toBe("96");
    }
  });

  it("treats India as domestic in every spelling", () => {
    for (const address of [
      { country_code: "IN", stateCode: "29" },
      { country: "India", stateCode: "29" },
      { country: "  india  ", stateCode: "29" },
    ]) {
      expect(resolvePlaceOfSupply({ shippingAddress: address, sellerStateCode: "27" })).toBe("29");
    }
  });

  it("treats an ABSENT country as domestic, not as an export", () => {
    // Offline orders carry a bare address object with no guaranteed country
    // key. Treating unknown as an export would zero-rate ordinary counter sales.
    expect(
      resolvePlaceOfSupply({
        shippingAddress: { stateCode: "29", city: "Bengaluru" },
        sellerStateCode: "27",
      }),
    ).toBe("29");
    expect(resolvePlaceOfSupply({ sellerStateCode: "27" })).toBe("27");
  });

  it("falls back to a foreign BILLING address only when there is no ship-to", () => {
    // For goods the place of supply is where the movement terminates, so a
    // domestic ship-to wins even when billing is abroad.
    expect(
      resolvePlaceOfSupply({
        shippingAddress: { stateCode: "29" },
        billingAddress: { country_code: "US" },
        sellerStateCode: "27",
      }),
    ).toBe("29");
    expect(
      resolvePlaceOfSupply({
        billingAddress: { country_code: "US" },
        sellerStateCode: "27",
      }),
    ).toBe("96");
  });
});
