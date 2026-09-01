import { apportionShipping } from './shipping-apportionment.util';

/**
 * Delivery charged on a taxable supply is a composite supply and takes the
 * principal supply's rate. This module added shipping to the grand total
 * untaxed, so every shipped order under-declared output tax.
 *
 * The two ways to get apportionment wrong are both silent: losing paise to
 * rounding so the invoice no longer reconciles, and attaching a share to an
 * exempt line so exempt goods acquire tax.
 */
describe('apportionShipping', () => {
  it('splits pro-rata by taxable value', () => {
    // 100 over 1000/3000 splits 25/75.
    expect(
      apportionShipping(
        [
          { taxableValue: 1000, taxable: true },
          { taxableValue: 3000, taxable: true },
        ],
        100,
      ),
    ).toEqual([25, 75]);
  });

  it('always sums EXACTLY to the charge, remainder to the largest line', () => {
    // 100 / 3 does not divide. Three naive 33.33s lose a paisa off the invoice.
    const parts = apportionShipping(
      [
        { taxableValue: 100, taxable: true },
        { taxableValue: 100, taxable: true },
        { taxableValue: 100, taxable: true },
      ],
      100,
    );

    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    // Ties go to the FIRST of the equal-largest lines — arbitrary but
    // deterministic, which is what matters for a reproducible invoice.
    expect(parts).toEqual([33.34, 33.33, 33.33]);
  });

  it('gives an exempt line NO share of the charge', () => {
    // An exempt supply must not acquire tax through its share of delivery.
    const parts = apportionShipping(
      [
        { taxableValue: 1000, taxable: true },
        { taxableValue: 1000, taxable: false },
      ],
      100,
    );

    expect(parts).toEqual([100, 0]);
  });

  it('leaves the charge unapportioned when nothing is taxable', () => {
    // Nothing to attach it to, so the caller keeps shipping untaxed rather than
    // inventing a rate.
    expect(
      apportionShipping([{ taxableValue: 1000, taxable: false }], 100),
    ).toEqual([0]);
  });

  it('is a no-op for a zero or absent charge', () => {
    expect(apportionShipping([{ taxableValue: 1000, taxable: true }], 0)).toEqual([0]);
    expect(apportionShipping([], 100)).toEqual([]);
  });

  it('ignores a zero-value line when dividing', () => {
    // A free line has no share of the delivery cost and must not absorb any.
    const parts = apportionShipping(
      [
        { taxableValue: 0, taxable: true },
        { taxableValue: 500, taxable: true },
      ],
      50,
    );

    expect(parts).toEqual([0, 50]);
  });
});
