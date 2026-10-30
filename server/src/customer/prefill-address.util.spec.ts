import { pickPrefillAddress, toPrefillAddress } from './prefill-address.util';

const customer = { firstName: 'Ana', lastName: 'Lee' };

describe('toPrefillAddress', () => {
  it("turns a Shopify address into the form's shape, resolving the GST state", () => {
    expect(
      toPrefillAddress(
        {
          first_name: 'Ana',
          last_name: 'Lee',
          address1: '12 MG Road',
          city: 'Kochi',
          province: 'Kerala',
          province_code: 'KL',
          zip: '682001',
          country: 'India',
          country_code: 'IN',
          phone: '98475 86793',
        },
        customer,
      ),
    ).toEqual({
      first_name: 'Ana',
      last_name: 'Lee',
      address1: '12 MG Road',
      city: 'Kochi',
      zip: '682001',
      stateCode: '32',
      province: 'Kerala',
      country: 'India',
      country_code: 'IN',
      phone: '+919847586793',
    });
  });

  it('keeps a CRM order address (already carrying stateCode) as it is', () => {
    const out = toPrefillAddress(
      { address1: '4 Park St', city: 'Kolkata', stateCode: '19', province: 'West Bengal', country_code: 'IN' },
      customer,
    );
    expect(out).toMatchObject({ stateCode: '19', province: 'West Bengal', country: 'India' });
  });

  it("falls back to the customer's name when the address has none", () => {
    expect(toPrefillAddress({ address1: 'x', city: 'y' }, customer)).toMatchObject({
      first_name: 'Ana',
      last_name: 'Lee',
    });
  });

  it('drops a phone that is not a valid number', () => {
    expect(toPrefillAddress({ address1: 'x', phone: '12345', country_code: 'IN' }, customer)).not.toHaveProperty('phone');
  });

  it('keeps a foreign address foreign — no Indian state is invented', () => {
    const out = toPrefillAddress(
      { address1: '1 Main St', city: 'Austin', province: 'Texas', province_code: 'TX', country: 'United States', country_code: 'US' },
      customer,
    );
    expect(out).toMatchObject({ province: 'Texas', country: 'United States', country_code: 'US' });
    expect(out).not.toHaveProperty('stateCode');
  });

  it('is null for nothing a merchant would recognise as an address', () => {
    expect(toPrefillAddress(null, customer)).toBeNull();
    expect(toPrefillAddress({}, customer)).toBeNull();
    expect(toPrefillAddress({ first_name: 'Ana', phone: '+919847586793' }, customer)).toBeNull();
    expect(toPrefillAddress([], customer)).toBeNull();
  });
});

describe('pickPrefillAddress', () => {
  it('takes the first usable candidate in order', () => {
    const out = pickPrefillAddress([null, {}, { address1: 'second', city: 'c' }, { address1: 'third' }], customer);
    expect(out?.address1).toBe('second');
  });

  it('is null when none is usable', () => {
    expect(pickPrefillAddress([null, undefined, {}], customer)).toBeNull();
  });
});
