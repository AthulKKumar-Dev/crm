import { isLineTaxable } from './taxability.util';

/**
 * Getting this backwards has two failure modes, both bad and neither loud:
 * treat an exempt line as taxable and the customer is overcharged on a
 * statutory invoice; treat a taxable line as exempt and output tax is
 * under-declared to the government.
 */
describe('isLineTaxable', () => {
  it('exempts the line when either flag says false', () => {
    expect(isLineTaxable({ lineTaxable: false, variantTaxable: true })).toBe(false);
    expect(isLineTaxable({ lineTaxable: true, variantTaxable: false })).toBe(false);
    expect(isLineTaxable({ lineTaxable: false, variantTaxable: false })).toBe(false);
  });

  it('taxes the line when both flags say true', () => {
    expect(isLineTaxable({ lineTaxable: true, variantTaxable: true })).toBe(true);
  });

  it('treats missing information as taxable, matching the column default', () => {
    // A Shopify line whose variant relation did not resolve must NOT be
    // silently exempted — that would turn a data-loading gap into an
    // under-declaration nobody would notice.
    expect(isLineTaxable({})).toBe(true);
    expect(isLineTaxable({ lineTaxable: null, variantTaxable: undefined })).toBe(true);
    expect(isLineTaxable({ variantTaxable: true })).toBe(true);
  });
});
