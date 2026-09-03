import { GstSupplyType } from '@prisma/client';
import { resolveLineTaxClassification } from './line-tax-classification.util';

const product = {
  hsnCode: '950611',
  unitOfMeasure: 'PCS',
  supplyType: GstSupplyType.TAXABLE,
};

const base = { product, defaultUnitOfMeasure: 'NOS', isExportSupply: false };

describe('resolveLineTaxClassification', () => {
  it('inherits every field from the product when the variant has no override', () => {
    expect(resolveLineTaxClassification({ ...base, variant: null })).toEqual({
      hsnCode: '950611',
      unitOfMeasure: 'PCS',
      supplyType: GstSupplyType.TAXABLE,
    });
    expect(
      resolveLineTaxClassification({
        ...base,
        variant: { hsnCode: null, unitOfMeasure: null, supplyType: null },
      }),
    ).toEqual({
      hsnCode: '950611',
      unitOfMeasure: 'PCS',
      supplyType: GstSupplyType.TAXABLE,
    });
  });

  it('lets the variant win field by field, leaving the others inherited', () => {
    expect(
      resolveLineTaxClassification({ ...base, variant: { hsnCode: '6109' } }),
    ).toEqual({
      hsnCode: '6109',
      unitOfMeasure: 'PCS',
      supplyType: GstSupplyType.TAXABLE,
    });
    expect(
      resolveLineTaxClassification({
        ...base,
        variant: { supplyType: GstSupplyType.EXEMPT },
      }).supplyType,
    ).toBe(GstSupplyType.EXEMPT);
    expect(
      resolveLineTaxClassification({
        ...base,
        variant: { unitOfMeasure: 'kgs' },
      }).unitOfMeasure,
    ).toBe('KGS');
  });

  it('treats an empty or whitespace variant HSN as blank, not as an override', () => {
    expect(
      resolveLineTaxClassification({ ...base, variant: { hsnCode: '   ' } }).hsnCode,
    ).toBe('950611');
  });

  it('does not let a variant override a product classified EXEMPT by accident', () => {
    // No default on the variant column: an absent supplyType must inherit.
    expect(
      resolveLineTaxClassification({
        ...base,
        product: { ...product, supplyType: GstSupplyType.EXEMPT },
        variant: { hsnCode: '6109' },
      }).supplyType,
    ).toBe(GstSupplyType.EXEMPT);
  });

  it('falls back to the org default UQC when neither side has a valid code', () => {
    expect(
      resolveLineTaxClassification({
        ...base,
        product: { ...product, unitOfMeasure: 'bogus' },
        variant: { unitOfMeasure: 'also-bogus' },
      }).unitOfMeasure,
    ).toBe('NOS');
  });

  it('returns null HSN when nobody classified the goods — never 0000', () => {
    expect(
      resolveLineTaxClassification({
        ...base,
        product: { ...product, hsnCode: null },
        variant: null,
      }).hsnCode,
    ).toBeNull();
  });

  it('forces ZERO_RATED on exports even when the variant overrides supply type', () => {
    expect(
      resolveLineTaxClassification({
        ...base,
        isExportSupply: true,
        variant: { supplyType: GstSupplyType.EXEMPT },
      }).supplyType,
    ).toBe(GstSupplyType.ZERO_RATED);
  });
});
