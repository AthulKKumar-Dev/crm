import { computeBucket, emptyBucket, totalsOf, type SalesProfitRow } from './profit.util';

/**
 * The arithmetic that turns raw sums into the dashboard's profit figures.
 *
 * What matters here is what happens when we DON'T know something. The metric
 * this replaced reported `totalPrice − shipping − discounts` as profit, which
 * for an offline order came out exactly equal to revenue — a confident number
 * with nothing behind it. Every case below is about the replacement refusing to
 * do that: unknown cost lowers coverage, it never becomes free margin, and it
 * never silently drags the reported margin down either.
 */

function row(over: Partial<SalesProfitRow> = {}): SalesProfitRow {
  return {
    bucket: new Date('2026-09-01T00:00:00.000Z'),
    gross_sales: 1180,
    tax: 180,
    shipping: 0,
    net_sales_gross: 1000,
    refunded_net: 0,
    line_net: 1000,
    line_net_with_cost: 1000,
    cogs_gross: 600,
    orders: 1,
    ...over,
  };
}

describe('computeBucket', () => {
  it('reports gross profit as net sales minus COGS when every line has a cost', () => {
    const b = computeBucket(row());

    expect(b.netSales).toBe(1000);
    expect(b.netSalesWithCost).toBe(1000);
    expect(b.cogs).toBe(600);
    expect(b.grossProfit).toBe(400);
    expect(b.costCoverage).toBe(1);
  });

  it('excludes uncosted lines from BOTH sides of the ratio, not just from COGS', () => {
    // Two equal lines, one variant priced, one not.
    const b = computeBucket(row({ line_net_with_cost: 500, cogs_gross: 300 }));

    expect(b.costCoverage).toBe(0.5);
    expect(b.netSalesWithCost).toBe(500);
    expect(b.cogs).toBe(300);
    expect(b.grossProfit).toBe(200);

    // The trap: dividing profit-on-the-covered-half by ALL net sales reports
    // 20%, and subtracting half the COGS from all the revenue reports 70%.
    // Both are wrong; the true margin on what we can actually price is 40%.
    const { grossMarginPct } = totalsOf([b]);
    expect(grossMarginPct).toBe(40);
  });

  it('treats a line with no variant the same as a line with no cost', () => {
    // variant_id is SET NULL when a variant is deleted, so the LEFT JOIN yields
    // a null cost. It must lower coverage — not contribute cost-free profit.
    const b = computeBucket(row({ line_net_with_cost: 0, cogs_gross: 0 }));

    expect(b.costCoverage).toBe(0);
    expect(b.cogs).toBe(0);
    expect(b.grossProfit).toBeNull();
  });

  it('returns null profit, never zero, when nothing sold has a known cost', () => {
    const b = computeBucket(row({ line_net_with_cost: 0, cogs_gross: 0 }));

    // A zero here renders as "you made no profit". The truth is "we cannot
    // say", and the UI shows an em dash for exactly this.
    expect(b.grossProfit).toBeNull();
    expect(b.grossProfit).not.toBe(0);
    expect(b.netSales).toBe(1000);
  });

  it('still reports net sales for a bucket with no cost data at all', () => {
    const b = computeBucket(row({ line_net_with_cost: 0, cogs_gross: 0 }));
    expect(b.netSales).toBe(1000);
  });

  it('nets refunds out of sales and cost together, leaving margin unchanged', () => {
    const full = totalsOf([computeBucket(row())]);
    const partial = totalsOf([computeBucket(row({ refunded_net: 200 }))]);

    expect(partial.netSales).toBe(800);
    expect(partial.cogs).toBe(480);
    expect(partial.grossProfit).toBe(320);
    // A return takes back the sale AND the goods, so the rate we sell at does
    // not move just because something came back.
    expect(partial.grossMarginPct).toBe(full.grossMarginPct);
  });

  it('clamps a refund larger than the sale rather than reporting negative sales', () => {
    const b = computeBucket(row({ refunded_net: 5000 }));

    expect(b.netSales).toBe(0);
    expect(b.cogs).toBe(0);
    expect(b.grossProfit).toBe(0);
  });

  it('carries tax and shipping through untouched for the reconciliation strip', () => {
    const b = computeBucket(row({ tax: 180, shipping: 90, gross_sales: 1270 }));

    expect(b.grossSales).toBe(1270);
    expect(b.tax).toBe(180);
    expect(b.shipping).toBe(90);
  });

  it('does not divide by zero on an empty bucket', () => {
    const b = computeBucket(
      row({
        gross_sales: 0, tax: 0, net_sales_gross: 0,
        line_net: 0, line_net_with_cost: 0, cogs_gross: 0, orders: 0,
      }),
    );

    expect(b.netSales).toBe(0);
    expect(b.costCoverage).toBe(0);
    expect(b.grossProfit).toBeNull();
  });
});

describe('totalsOf', () => {
  it('sums to exactly what the buckets show, so the chart and the card agree', () => {
    const buckets = [
      computeBucket(row({ net_sales_gross: 1000, cogs_gross: 600, line_net: 1000, line_net_with_cost: 1000 })),
      computeBucket(row({ net_sales_gross: 500, cogs_gross: 200, line_net: 500, line_net_with_cost: 500 })),
      computeBucket(emptyRow()),
    ];
    const totals = totalsOf(buckets);

    // This is the property the whole change exists to establish: the number on
    // the card is the sum of the bars beside it.
    expect(totals.netSales).toBe(buckets.reduce((s, b) => s + b.netSales, 0));
    expect(totals.cogs).toBe(buckets.reduce((s, b) => s + b.cogs, 0));
    expect(totals.grossProfit).toBe(1500 - 800);
  });

  it('reports null profit and null margin when no bucket has cost data', () => {
    const totals = totalsOf([
      computeBucket(row({ line_net_with_cost: 0, cogs_gross: 0 })),
      computeBucket(row({ line_net_with_cost: 0, cogs_gross: 0 })),
    ]);

    expect(totals.grossProfit).toBeNull();
    expect(totals.grossMarginPct).toBeNull();
    expect(totals.costCoverage).toBe(0);
    expect(totals.netSales).toBe(2000);
  });

  it('blends coverage across buckets rather than averaging the percentages', () => {
    const totals = totalsOf([
      // 1000 net, fully costed.
      computeBucket(row({ line_net: 1000, line_net_with_cost: 1000, cogs_gross: 600 })),
      // 1000 net, none of it costed.
      computeBucket(row({ line_net: 1000, line_net_with_cost: 0, cogs_gross: 0 })),
    ]);

    expect(totals.netSales).toBe(2000);
    expect(totals.netSalesWithCost).toBe(1000);
    expect(totals.costCoverage).toBe(0.5);
    expect(totals.grossProfit).toBe(400);
    expect(totals.grossMarginPct).toBe(40);
  });

  it('handles an all-empty series', () => {
    const totals = totalsOf([emptyBucket(), emptyBucket()]);

    expect(totals.netSales).toBe(0);
    expect(totals.grossProfit).toBeNull();
    expect(totals.grossMarginPct).toBeNull();
    expect(totals.orders).toBe(0);
  });
});

function emptyRow(): SalesProfitRow {
  return row({
    gross_sales: 0, tax: 0, shipping: 0, net_sales_gross: 0,
    refunded_net: 0, line_net: 0, line_net_with_cost: 0, cogs_gross: 0, orders: 0,
  });
}
