import {
  extractRefundTax,
  sumRefundTransactions,
} from './refund-tax.util';

/**
 * This decides what a credit note gives back — and therefore how much output
 * tax a merchant stops owing.
 *
 * Three silent failures it replaces: only the first refund transaction was
 * counted, so a split-tender return was understated by the whole second leg;
 * no tax was captured at all, so a refunded sale stayed 100% in declared
 * liability for ever; and `order_adjustments` were ignored, so a refund that
 * gave back the delivery charge looked smaller than it was.
 */
describe('sumRefundTransactions', () => {
  it('sums EVERY transaction, not just the first', () => {
    // Part card, part store credit — ordinary for a partial return. The old
    // code took transactions[0] and lost the rest.
    const total = sumRefundTransactions({
      transactions: [
        { amount: '500.00', status: 'success' },
        { amount: '250.00', status: 'success' },
      ],
    });

    expect(total.toNumber()).toBe(750);
  });

  it('ignores a failed leg rather than crediting money that never moved', () => {
    const total = sumRefundTransactions({
      transactions: [
        { amount: '500.00', status: 'success' },
        { amount: '999.00', status: 'failure' },
      ],
    });

    expect(total.toNumber()).toBe(500);
  });

  it('counts a pending leg, which settles', () => {
    expect(
      sumRefundTransactions({
        transactions: [{ amount: '100.00', status: 'pending' }],
      }).toNumber(),
    ).toBe(100);
  });

  it('falls back to the scalar amount when no transactions are present', () => {
    expect(sumRefundTransactions({ amount: '42.50' }).toNumber()).toBe(42.5);
    expect(sumRefundTransactions({}).toNumber()).toBe(0);
  });
});

describe('extractRefundTax', () => {
  it('sums tax across refunded lines', () => {
    const result = extractRefundTax({
      transactions: [{ amount: '1180.00', status: 'success' }],
      refund_line_items: [
        { total_tax: '90.00', tax_lines: [{ price: '90.00' }] },
        { total_tax: '90.00', tax_lines: [{ price: '90.00' }] },
      ],
    });

    expect(result.amount.toNumber()).toBe(1180);
    expect(result.totalTax!.toNumber()).toBe(180);
    expect(result.taxLines).toHaveLength(2);
  });

  it('falls back to the scalar total_tax when a line has no tax_lines array', () => {
    const result = extractRefundTax({
      refund_line_items: [{ total_tax: '45.00' }],
    });

    expect(result.totalTax!.toNumber()).toBe(45);
  });

  it('includes order_adjustments — a refunded delivery charge is real', () => {
    // Shopify reports shipping and after-the-fact discounts here rather than on
    // refund_line_items. Ignoring them understated the credit note.
    const result = extractRefundTax({
      refund_line_items: [{ total_tax: '90.00' }],
      order_adjustments: [{ amount: '-100.00', tax_amount: '-18.00' }],
    });

    // Adjustment tax arrives negative; a credit note records magnitudes.
    expect(result.shippingTax!.toNumber()).toBe(18);
    expect(result.totalTax!.toNumber()).toBe(108); // 90 + 18
  });

  it('returns NULL tax when the payload carried none at all', () => {
    // Load-bearing. A refund synced before these columns existed has no tax
    // breakdown, and must not be mistaken for a tax-free refund — that would
    // reverse the sale value without reversing any of its tax.
    const result = extractRefundTax({
      transactions: [{ amount: '500.00', status: 'success' }],
    });

    expect(result.totalTax).toBeNull();
    expect(result.shippingTax).toBeNull();
    expect(result.taxLines).toBeNull();
  });

  it('returns ZERO tax when the payload explicitly says zero', () => {
    // An empty refund_line_items array IS a claim, unlike an absent key.
    const result = extractRefundTax({ refund_line_items: [] });

    expect(result.totalTax).not.toBeNull();
    expect(result.totalTax!.toNumber()).toBe(0);
  });

  it('does not drift on values that lose precision as floats', () => {
    const result = extractRefundTax({
      refund_line_items: [{ total_tax: '0.10' }, { total_tax: '0.20' }],
    });

    expect(result.totalTax!.toString()).toBe('0.3');
  });
});

/**
 * NULL-vs-ZERO on the sync path.
 *
 * The GraphQL sync used to build `refund_line_items` with no tax at all, so the
 * extractor walked a tax-less array and returned 0.00 — recording a taxed
 * refund as a TAX-FREE one. That is the single distinction the nullable columns
 * exist to make, and a credit note pre-filled from it would have reversed the
 * sale value while reversing none of its tax.
 */
describe('extractRefundTax — the null contract', () => {
  it('returns null when the lines carry no tax information at all', () => {
    // Exactly the shape the old GraphQL transform produced.
    const result = extractRefundTax({
      transactions: [{ amount: '1180.00', status: 'success' }],
      refund_line_items: [
        { id: '1', quantity: 1, line_item_id: '9', restock_type: 'return' },
      ],
    });

    expect(result.totalTax).toBeNull();
  });

  it('returns null when only SOME lines carry tax', () => {
    // All-or-nothing: a partial sum understates the credit note and presents a
    // guess as a fact.
    const result = extractRefundTax({
      refund_line_items: [{ total_tax: '90.00' }, { quantity: 1 }],
    });

    expect(result.totalTax).toBeNull();
  });

  it('reads the tax the sync path now supplies', () => {
    const result = extractRefundTax({
      transactions: [{ amount: '1180.00', status: 'success' }],
      refund_line_items: [
        { id: '1', quantity: 1, line_item_id: '9', total_tax: '90.00' },
        { id: '2', quantity: 1, line_item_id: '8', total_tax: '90.00' },
      ],
    });

    expect(result.totalTax!.toNumber()).toBe(180);
  });

  it('still treats an explicit zero as a real answer', () => {
    expect(extractRefundTax({ refund_line_items: [{ total_tax: '0.00' }] }).totalTax!.toNumber()).toBe(0);
  });
});
