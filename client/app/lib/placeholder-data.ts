export interface StatCardData {
  label: string;
  value: string;
  change: number;
  changeLabel: string;
}

// ─── Bar Chart Data ───────────────────────────────────────────────────────────

/** Monthly revenue vs. profit data for the bar chart widget. */
export const PROFIT_CHART_DATA = [
  { month: "Jan", revenue: 62000, profit: 38000 },
  { month: "Mar", revenue: 48000, profit: 28000 },
  { month: "May", revenue: 71000, profit: 45000 },
  { month: "Jul", revenue: 55000, profit: 32000 },
  { month: "Sep", revenue: 83000, profit: 54000 },
  { month: "Nov", revenue: 96000, profit: 61000 },
  { month: "Dec", revenue: 110000, profit: 72000 },
];

// ─── Donut Chart Data ─────────────────────────────────────────────────────────

/** Sales distribution by category for the donut chart widget. */
export const SALES_CHART_DATA = [
  { name: "Electronics", value: 37715, color: "#a78bfa" },
  { name: "Furniture", value: 29153, color: "#fbbf24" },
  { name: "Clothes", value: 11682, color: "#fb923c" },
  { name: "Shoes", value: 35715, color: "#818cf8" },
];

// ─── Analytics Stats ──────────────────────────────────────────────────────────

/** Summary statistics shown on the analytics page. */
export const ANALYTICS_STATS: StatCardData[] = [
  { label: "Total Revenue", value: "$96,715", change: 18, changeLabel: "vs last month" },
  { label: "Conversion Rate", value: "3.24%", change: -5, changeLabel: "vs last month" },
  { label: "Avg. Order Value", value: "$148.30", change: 12, changeLabel: "vs last month" },
  { label: "Returning Customers", value: "41.8%", change: 7, changeLabel: "vs last month" },
];

/** Month-over-month trend data (revenue, sessions, orders) for the analytics line chart. */
export const ANALYTICS_TREND_DATA = [
  { month: "Jan", revenue: 62000, sessions: 18400, orders: 419 },
  { month: "Feb", revenue: 54000, sessions: 16200, orders: 364 },
  { month: "Mar", revenue: 48000, sessions: 14800, orders: 324 },
  { month: "Apr", revenue: 70000, sessions: 21000, orders: 472 },
  { month: "May", revenue: 71000, sessions: 22500, orders: 479 },
  { month: "Jun", revenue: 65000, sessions: 20100, orders: 438 },
  { month: "Jul", revenue: 55000, sessions: 17300, orders: 371 },
  { month: "Aug", revenue: 78000, sessions: 24000, orders: 526 },
  { month: "Sep", revenue: 83000, sessions: 25800, orders: 560 },
  { month: "Oct", revenue: 91000, sessions: 27600, orders: 614 },
  { month: "Nov", revenue: 96000, sessions: 29200, orders: 648 },
  { month: "Dec", revenue: 110000, sessions: 33500, orders: 742 },
];

/** Traffic acquisition channel breakdown for the analytics table. */
export const ANALYTICS_CHANNEL_DATA = [
  { channel: "Organic", sessions: 12400, orders: 298, revenue: 44200 },
  { channel: "Paid Search", sessions: 8900, orders: 214, revenue: 31800 },
  { channel: "Social", sessions: 6200, orders: 149, revenue: 22100 },
  { channel: "Email", sessions: 3800, orders: 91, revenue: 13500 },
  { channel: "Direct", sessions: 2100, orders: 50, revenue: 7400 },
  { channel: "Referral", sessions: 1500, orders: 36, revenue: 5300 },
];
