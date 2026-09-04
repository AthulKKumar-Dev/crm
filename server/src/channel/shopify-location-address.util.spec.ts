import { toWarehouseAddress } from './shopify-location-address.util';

/**
 * The warehouse address is what an invoice prints as "Dispatch From" and what
 * decides whether a warehouse may be linked to a given GSTIN, so the shape has
 * to satisfy both the server's state extractor and the client's renderer.
 */
describe('toWarehouseAddress', () => {
  it('maps a full Shopify address and resolves the GST state code', () => {
    expect(
      toWarehouseAddress({
        address1: '12 Industrial Estate',
        address2: 'Unit 4',
        city: 'Bhiwandi',
        province: 'Maharashtra',
        provinceCode: 'MH',
        zip: '421302',
        country: 'India',
        countryCode: 'IN',
        phone: '+91 22 1234 5678',
      }),
    ).toEqual({
      address1: '12 Industrial Estate',
      address2: 'Unit 4',
      city: 'Bhiwandi',
      zip: '421302',
      province: 'Maharashtra',
      provinceCode: 'MH',
      country: 'India',
      countryCode: 'IN',
      phone: '+91 22 1234 5678',
      stateCode: '27',
    });
  });

  it('omits stateCode when the province is not an Indian state', () => {
    const result = toWarehouseAddress({ city: 'Dubai', provinceCode: 'DU' });
    expect(result).toEqual({ city: 'Dubai', provinceCode: 'DU' });
    expect(result).not.toHaveProperty('stateCode');
  });

  it('drops blank fields instead of storing empty strings', () => {
    expect(toWarehouseAddress({ address1: '  ', city: 'Nashik', zip: null })).toEqual({
      city: 'Nashik',
    });
  });

  it('returns null when there is nothing to store', () => {
    expect(toWarehouseAddress(null)).toBeNull();
    expect(toWarehouseAddress(undefined)).toBeNull();
    expect(toWarehouseAddress({ address1: '', city: null })).toBeNull();
  });
});
