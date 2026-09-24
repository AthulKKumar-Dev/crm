import { countryCodeOf, normalizePhone, phoneLookupVariants } from './phone.util';

describe('phoneLookupVariants', () => {
  it('covers the E.164 the form sends and the as-typed form older customers have', () => {
    expect(phoneLookupVariants('+919847586793').sort()).toEqual(['+919847586793', '9847586793']);
  });

  it('finds an E.164-stored customer from an as-typed number when the country is known', () => {
    expect(phoneLookupVariants('9847586793', 'IN').sort()).toEqual(['+919847586793', '9847586793']);
  });

  it('falls back to the raw value when the number cannot be parsed', () => {
    expect(phoneLookupVariants('12345')).toEqual(['12345']);
    expect(phoneLookupVariants('9847586793')).toEqual(['9847586793']);
  });
});

describe('countryCodeOf', () => {
  it('reads Shopify and CRM address shapes', () => {
    expect(countryCodeOf({ country_code: 'IN' })).toBe('IN');
    expect(countryCodeOf({ countryCode: 'us' })).toBe('US');
  });

  it('is null for anything else', () => {
    expect(countryCodeOf(null)).toBeNull();
    expect(countryCodeOf('IN')).toBeNull();
    expect(countryCodeOf({ country: 'India' })).toBeNull();
    expect(countryCodeOf({ country_code: '  ' })).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('still returns E.164 or null', () => {
    expect(normalizePhone('9847586793', 'IN')).toBe('+919847586793');
    expect(normalizePhone('not a phone', 'IN')).toBeNull();
  });
});
