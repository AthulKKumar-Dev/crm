/**
 * Pure arithmetic behind the dashboard's gross-profit figures.
 *
 * Kept out of the service (and out of SQL) so the interesting cases — a
 * variant with no cost, a line whose variant was deleted, a partial refund —
 * can be asserted directly in a unit test instead of through a database.
 */

/** One month's worth of raw aggregates, exactly as the SQL returns it. */
export interface SalesProfitRow {
  /** Month start, cut in the organization's timezone. */
  bucket: Date;
  /** Sum of `Order.totalPrice` — what customers actually paid, tax and shipping in. */
  gross_sales: number;
  tax: number;
  shipping: number;
  /** Sum of `Order.subtotalPrice`, corrected for tax-inclusive pricing. */
  net_sales_gross: number;
  /** Sum of `refund.amount - refund.totalTax`. */
  refunded_net: number;
  /** Sum over line items of `price × qty − totalDiscount`. Coverage denominator. */
  line_net: number;
  /** Same sum restricted to lines whose variant has a known cost. Coverage numerator. */
  line_net_with_cost: number;
  /** Sum of `variant.cost × qty` over those same lines. */
  cogs_gross: number;
  orders: number;
}

export interface ProfitBucket {
  grossSales: number;
  tax: number;
  shipping: number;
  refunds: number;
  /** Post-discount, pre-tax, pre-shipping, net of refunds. */
  netSales: number;
  /** The slice of `netSales` backed by a known cost — the profit denominator. */
  netSalesWithCost: number;
  cogs: number;
  /** `netSalesWithCost − cogs`. NULL, never 0, when no line has a cost. */
  grossProfit: number | null;
  /** 0..1. Share of line-level net sales backed by a known cost. */
  costCoverage: number;
  orders: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Turn one raw bucket into the figures we report.
 *
 * Coverage is a LINE-LEVEL ratio on purpose. `Order.subtotalPrice` and the sum
 * of its lines' net need not agree — a channel may report an order-level
 * discount in its own allocation block rather than on the line — so a ratio of
 * two line sums is the only coverage figure immune to that gap. The ratio is
 * then applied to the authoritative order-level revenue.
 */
export function computeBucket(row: SalesProfitRow): ProfitBucket {
  const costCoverage = row.line_net > 0 ? row.line_net_with_cost / row.line_net : 0;

  // A return takes back the sale AND the cost of the goods, pro rata. We can't
  // know WHICH skus came back without parsing OrderRefund.lineItems, so margin
  // is held constant across a refund rather than guessed at.
  const kept =
    row.net_sales_gross > 0
      ? Math.min(1, Math.max(0, 1 - row.refunded_net / row.net_sales_gross))
      : 1;

  const netSales = round2(row.net_sales_gross * kept);
  const netSalesWithCost = round2(row.net_sales_gross * costCoverage * kept);
  const cogs = round2(row.cogs_gross * kept);

  return {
    grossSales: round2(row.gross_sales),
    tax: round2(row.tax),
    shipping: round2(row.shipping),
    refunds: round2(row.refunded_net),
    netSales,
    netSalesWithCost: costCoverage > 0 ? netSalesWithCost : 0,
    cogs: costCoverage > 0 ? cogs : 0,
    // NULL, never 0. A 0 renders as "no profit"; the truth is "unknown profit".
    // Same instinct as calcMargin() on the client, which returns null so the
    // UI can show an em dash instead of inventing a number.
    grossProfit: costCoverage > 0 ? round2(netSalesWithCost - cogs) : null,
    costCoverage: round4(costCoverage),
    orders: row.orders,
  };
}

const EMPTY_BUCKET: ProfitBucket = {
  grossSales: 0,
  tax: 0,
  shipping: 0,
  refunds: 0,
  netSales: 0,
  netSalesWithCost: 0,
  cogs: 0,
  grossProfit: null,
  costCoverage: 0,
  orders: 0,
};

export function emptyBucket(): ProfitBucket {
  return { ...EMPTY_BUCKET };
}

export interface ProfitTotals extends ProfitBucket {
  /** `grossProfit ÷ netSalesWithCost × 100`. NULL whenever `grossProfit` is. */
  grossMarginPct: number | null;
}

/**
 * Sum buckets into the headline figures.
 *
 * Margin shares its denominator with profit (`netSalesWithCost`, not
 * `netSales`). Dividing profit-on-the-covered-subset by ALL net sales would
 * understate margin in exact proportion to how much cost data is missing,
 * which is the same silent-omission failure as assuming zero cost — just
 * pointing the other way.
 */
export function totalsOf(buckets: ProfitBucket[]): ProfitTotals {
  const sum = (pick: (b: ProfitBucket) => number) =>
    round2(buckets.reduce((acc, b) => acc + pick(b), 0));

  const netSales = sum((b) => b.netSales);
  const netSalesWithCost = sum((b) => b.netSalesWithCost);
  const cogs = sum((b) => b.cogs);

  const anyCovered = buckets.some((b) => b.grossProfit !== null);
  const grossProfit = anyCovered ? round2(netSalesWithCost - cogs) : null;

  return {
    grossSales: sum((b) => b.grossSales),
    tax: sum((b) => b.tax),
    shipping: sum((b) => b.shipping),
    refunds: sum((b) => b.refunds),
    netSales,
    netSalesWithCost,
    cogs,
    grossProfit,
    grossMarginPct:
      grossProfit !== null && netSalesWithCost > 0
        ? round2((grossProfit / netSalesWithCost) * 100)
        : null,
    costCoverage: netSales > 0 ? round4(netSalesWithCost / netSales) : 0,
    orders: buckets.reduce((acc, b) => acc + b.orders, 0),
  };
}
