import { Prisma } from '@prisma/client';
import { compareTax } from './tax-reconciliation.util';

/**
 * This flag is the only thing that will tell a merchant their declared tax and
 * their collected tax have drifted apart. Two ways to make it worthless: set
 * the tolerance so tight it fires on ordinary per-line rounding (it gets
 * ignored, then switched off), or so loose that a whole wrong rate slips
 * through.
 */
describe('compareTax', () => {
  it('does not flag an exact match', () => {
    const result = compareTax('1800.00', '1800.00');

    expect(result.mismatch).toBe(false);
    expect(result.delta!.toNumber()).toBe(0);
  });

  it('absorbs sub-rupee rounding drift', () => {
    // 60 paise across a multi-line invoice is per-line rounding, not a config
    // error. Inside the ₹1 floor.
    expect(compareTax('1800.00', '1800.60').mismatch).toBe(false);
  });

  it('flags a whole wrong rate', () => {
    // ₹10,000 taxed at 18% vs 12%: 1800 vs 1200.
    const result = compareTax('1200.00', '1800.00');

    expect(result.mismatch).toBe(true);
    expect(result.delta!.toNumber()).toBe(600);
  });

  it('scales its tolerance with the amount', () => {
    // On ₹2,00,000 of tax, ₹900 is 0.45% — inside the relative band, which the
    // flat ₹1 floor alone would have flagged.
    expect(compareTax('200000.00', '200900.00').mismatch).toBe(false);
    // ₹10,000 out is 5% — well outside.
    expect(compareTax('200000.00', '210000.00').mismatch).toBe(true);
  });

  it('flags in both directions', () => {
    // Under-declaring matters as much as over-declaring.
    const under = compareTax('1800.00', '1200.00');

    expect(under.mismatch).toBe(true);
    expect(under.delta!.toNumber()).toBe(-600);
  });

  it('never flags when there was nothing to compare', () => {
    // Offline orders carry no channel tax figure, and neither does any order
    // predating these columns. "Never compared" must not read as "mismatch",
    // or every historical invoice lights up the moment this ships.
    const result = compareTax(null, '1800.00');

    expect(result.mismatch).toBe(false);
    expect(result.chargedTax).toBeNull();
    expect(result.delta).toBeNull();

    expect(compareTax(undefined, '1800.00').mismatch).toBe(false);
  });

  it('treats a channel-reported zero as a real comparison', () => {
    // Zero is a claim ("we charged no tax"), unlike null. If the CRM declares
    // ₹1800 against it, that IS a mismatch.
    const result = compareTax('0.00', '1800.00');

    expect(result.chargedTax!.toNumber()).toBe(0);
    expect(result.mismatch).toBe(true);
  });

  it('accepts Decimal input as well as strings', () => {
    expect(
      compareTax(new Prisma.Decimal('1800.00'), new Prisma.Decimal('1800.00'))
        .mismatch,
    ).toBe(false);
  });
});
