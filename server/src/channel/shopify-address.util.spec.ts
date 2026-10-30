import { defaultCountryFor, toShopifyAddress } from './shopify-address.util';
import { stateCodeToProvinceCode, extractStateFromAddress } from '../gst/place-of-supply.util';
import { INDIAN_STATES } from '../gst/constants/indian-states';

describe('toShopifyAddress', () => {
  it("turns a CRM form address into Shopify's MailingAddressInput", () => {
    expect(
      toShopifyAddress({
        first_name: 'Ana',
        last_name: 'Lee',
        address1: '7 Marine Drive',
        address2: 'Flat 3',
        city: 'Kochi',
        zip: '682031',
        province: 'Kerala',
        stateCode: '32',
        country: 'India',
        country_code: 'IN',
        phone: '98475 86793',
      }),
    ).toEqual({
      firstName: 'Ana',
      lastName: 'Lee',
      address1: '7 Marine Drive',
      address2: 'Flat 3',
      city: 'Kochi',
      zip: '682031',
      provinceCode: 'KL',
      countryCode: 'IN',
      phone: '+919847586793',
    });
  });

  it('never sends the deprecated province/country fields', () => {
    const out = toShopifyAddress({ address1: 'x', city: 'y', stateCode: '32', province: 'Kerala', country: 'India' });
    expect(out).not.toHaveProperty('province');
    expect(out).not.toHaveProperty('country');
  });

  it('infers India from a GST state when the address has no country', () => {
    expect(toShopifyAddress({ address1: 'x', stateCode: '19' })).toMatchObject({ provinceCode: 'WB', countryCode: 'IN' });
  });

  it('passes a Shopify-shaped address through', () => {
    expect(
      toShopifyAddress({ address1: '1 Main St', city: 'Austin', province_code: 'TX', country_code: 'US', phone: '(201) 555-0123' }),
    ).toEqual({ address1: '1 Main St', city: 'Austin', provinceCode: 'TX', countryCode: 'US', phone: '+12015550123' });
  });

  it('drops a phone Shopify would reject instead of failing the order', () => {
    expect(toShopifyAddress({ address1: 'x', city: 'y', country_code: 'IN', phone: '12345' })).not.toHaveProperty('phone');
  });

  it('sends nothing for an address without a street or city', () => {
    expect(toShopifyAddress(null)).toBeUndefined();
    expect(toShopifyAddress({})).toBeUndefined();
    expect(toShopifyAddress({ first_name: 'Ana', phone: '+919847586793', stateCode: '32' })).toBeUndefined();
  });
});

describe('stateCodeToProvinceCode', () => {
  it('round-trips with the forward map for every state Shopify has a code for', () => {
    for (const { code } of INDIAN_STATES) {
      const province = stateCodeToProvinceCode(code);
      if (!province) continue; // '28', '96', '97' — not Shopify provinces
      expect(extractStateFromAddress({ province_code: province })).toBe(code);
    }
  });

  it('is null for a code with no Shopify province', () => {
    expect(stateCodeToProvinceCode('97')).toBeNull();
  });
});

describe('toShopifyAddress — address with no country (how #1025 became "United States")', () => {
  // The CRM form only set the country when a state was picked. Sent without
  // one, Shopify used the STORE's country: a US dev store turned an Ernakulam
  // address into "United States", taxed as an export (place of supply 96).
  const noCountry = { address1: 'Ernakulam Kerala', city: 'Ernakulam', zip: '682509' };

  it('sends the default country the caller gives it', () => {
    expect(toShopifyAddress(noCountry, 'IN')).toMatchObject({ countryCode: 'IN' });
  });

  it("never overrides a country the address names", () => {
    expect(toShopifyAddress({ ...noCountry, country_code: 'US' }, 'IN')).toMatchObject({ countryCode: 'US' });
    expect(toShopifyAddress({ ...noCountry, stateCode: '32' }, null)).toMatchObject({ countryCode: 'IN' });
  });

  it('sends no country when there is neither one on the address nor a default', () => {
    expect(toShopifyAddress(noCountry, null)).not.toHaveProperty('countryCode');
  });
});

describe('defaultCountryFor', () => {
  it('is India for an INR order and nothing otherwise', () => {
    expect(defaultCountryFor('INR')).toBe('IN');
    expect(defaultCountryFor('inr')).toBe('IN');
    expect(defaultCountryFor('USD')).toBeNull();
    expect(defaultCountryFor(null)).toBeNull();
  });
});
