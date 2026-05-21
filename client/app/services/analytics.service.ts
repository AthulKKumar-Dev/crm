import { apiClient } from "~/lib/api-client";

export type AnalyticsRange = "30d" | "6m" | "12m";

export interface AnalyticsQueryParams {
  range?: AnalyticsRange;
  channelId?: string;
}

export interface AnalyticsStat {
  key:
    | "totalRevenue"
    | "conversionRate"
    | "avgOrderValue"
    | "returningCustomers"
    | "bounceRate"
    | "avgSessionDuration"
    | "cartToCheckoutRate"
    | "checkoutToOrderRate"
    | "cartAbandonmentRate";
  label: string;
  value: string;
  change: number;
  changeLabel: string;
}

export interface AnalyticsTrendPoint {
  month: string;
  revenue: number;
  sessions: number;
  orders: number;
}

export interface AnalyticsChannelRow {
  channel: string;
  sessions: number;
  orders: number;
  revenue: number;
}

export interface AnalyticsFunnel {
  sessions: number;
  /// Total pages viewed across all sessions. Surfaced as a parallel
  /// metric because it can exceed `sessions` (each session views many
  /// pages) and so doesn't belong inside the monotonic funnel.
  pageviews: number;
  /// Count of sessions where the visitor added ≥1 item to cart.
  addToCarts: number;
  /// Count of sessions that reached the checkout page.
  reachedCheckout: number;
  orders: number;
}

export interface AnalyticsProductRow {
  title: string;
  productViews: number;
  addToCarts: number;
  checkouts: number;
  orders: number;
}

export interface AnalyticsOverview {
  stats: AnalyticsStat[];
  trend: AnalyticsTrendPoint[];
  channels: AnalyticsChannelRow[];
  funnel: AnalyticsFunnel;
  topViewedProducts: AnalyticsProductRow[];
  topAddedToCart: AnalyticsProductRow[];
  /// "shopify_ql" — full Shopify analytics data (Advanced/Plus).
  /// "shopify_orders_fb" — order-derived fallback (Basic plan or
  ///                       `read_reports` not granted). Sessions/pageviews
  ///                       will be zero in this mode.
  /// "none" — no snapshots yet (first load, refresh in flight).
  source: "shopify_ql" | "shopify_orders_fb" | "none" | string;
  currency: string;
  /// ISO timestamp of the freshest snapshot. Null on first load.
  lastRefreshedAt: string | null;
}

export interface RefreshChannelResult {
  channelId: string;
  source: "shopify_ql" | "shopify_orders_fb";
  snapshotsWritten: number;
  error: string | null;
  errorCode: string | null;
}

export interface RefreshResponse {
  refreshed: number;
  results: RefreshChannelResult[];
}

export const analyticsService = {
  getOverview: (params?: AnalyticsQueryParams) =>
    apiClient
      .get<AnalyticsOverview>("/analytics/overview", { params })
      .then((response) => response.data),

  refresh: (params?: AnalyticsQueryParams) =>
    apiClient
      // `{}` (not `null`) because axios serialises `null` to the string
      // "null", which NestJS's JSON body parser rejects with a 400.
      .post<RefreshResponse>("/analytics/refresh", {}, { params })
      .then((response) => response.data),
};
