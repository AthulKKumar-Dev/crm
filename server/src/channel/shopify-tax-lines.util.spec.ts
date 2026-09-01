import { Prisma } from '@prisma/client';
import { extractShippingTax, sumTaxLines } from './shopify-tax-lines.util';

/**
 * These feed the columns the invoice reconciliation compares against. The
 * null-versus-zero distinction is the whole point: if "we were never told"
 * collapses into "the channel charged zero", every offline and every
 * pre-existing invoice is flagged as a mismatch and the warning becomes noise
 * that gets switched off.
 */
describe('sumTaxLines', () => {
  it('returns null when the payload says nothing about tax', () => {
    expect(sumTaxLines(undefined)).toBeNull();
    expect(sumTaxLines(null)).toBeNull();
  });

  it('returns zero — not null — for an explicit empty array', () => {
    // An empty array IS a claim: no tax was charged.
    const result = sumTaxLines([]);

    expect(result).not.toBeNull();
    expect(result!.toNumber()).toBe(0);
  });

  it('sums GraphQL-shaped lines exactly', () => {
    const result = sumTaxLines([
      { priceSet: { shopMoney: { amount: '90.00' } } },
      { priceSet: { shopMoney: { amount: '90.00' } } },
    ]);

    expect(result!.toString()).toBe('180');
  });

  it('sums REST-webhook-shaped lines', () => {
    // The webhook path sends a bare `price` string; both shapes must work or
    // the two ingestion paths disagree about the same order.
    expect(sumTaxLines([{ price: '45.50' }, { price: '45.50' }])!.toNumber()).toBe(91);
  });

  it('does not drift on values that lose precision as floats', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in binary floating point.
    expect(sumTaxLines([{ price: '0.10' }, { price: '0.20' }])!.toString()).toBe('0.3');
  });

  it('skips unparseable amounts rather than throwing', () => {
    const result = sumTaxLines([{ price: '10.00' }, { price: 'n/a' }]);

    expect(result!.toNumber()).toBe(10);
  });
});

describe('extractShippingTax', () => {
  it('returns null when the payload carries no shipping lines', () => {
    expect(extractShippingTax({})).toBeNull();
    expect(extractShippingTax(null)).toBeNull();
  });

  it('totals tax across every shipping line', () => {
    const result = extractShippingTax({
      shipping_lines: [
        { tax_lines: [{ price: '18.00' }] },
        { tax_lines: [{ price: '9.00' }, { price: '9.00' }] },
      ],
    });

    expect(result!.amount.toNumber()).toBe(36);
    expect(result!.lines).toHaveLength(3);
  });

  it('reports zero for a shipping line that was not taxed', () => {
    const result = extractShippingTax({ shipping_lines: [{ tax_lines: [] }] });

    expect(result!.amount.toNumber()).toBe(0);
  });

  it('accepts Decimal-compatible input without losing precision', () => {
    const result = extractShippingTax({
      shipping_lines: [{ tax_lines: [{ price: new Prisma.Decimal('12.34') }] }],
    });

    expect(result!.amount.toString()).toBe('12.34');
  });
});
