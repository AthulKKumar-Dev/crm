import { apiClient } from "~/lib/api-client";

export type AnalyticsRange = "30d" | "6m" | "12m";
export type AnalyticsChannelFilter = "all" | "shopify" | "instagram" | "whatsapp";

export interface AnalyticsQueryParams {
  range?: AnalyticsRange;
  channelId?: string;
  channel?: AnalyticsChannelFilter;
}

export interface DashboardStat {
  key: "totalAddToCart" | "totalCheckout" | "totalAbandonedCarts";
  label: string;
  value: number;
  change: number;
  changeLabel: string;
}

export interface DashboardTrendPoint {
  label: string;
  addToCart: number;
  reachedCheckout: number;
  completedOrders: number;
}

export interface DashboardPageRow {
  path: string;
  title: string | null;
  views: number;
}

export interface DashboardProductRow {
  title: string;
  addToCarts: number;
}

export interface DashboardViewedProductRow {
  title: string;
  views: number;
}

export interface AnalyticsDashboard {
  stats: DashboardStat[];
  topPages: DashboardPageRow[];
  topViewedProducts: DashboardViewedProductRow[];
  topAddedToCart: DashboardProductRow[];
  trend: DashboardTrendPoint[];
  meta: {
    channel: AnalyticsChannelFilter;
    lastRefreshedAt: string | null;
  };
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
  getDashboard: (params?: AnalyticsQueryParams) =>
    apiClient
      .get<AnalyticsDashboard>("/analytics/dashboard", { params })
      .then((response) => response.data),

  refresh: (params?: AnalyticsQueryParams) =>
    apiClient
      // `{}` (not `null`) because axios serialises `null` to the string
      // "null", which NestJS's JSON body parser rejects with a 400.
      .post<RefreshResponse>("/analytics/refresh", {}, { params })
      .then((response) => response.data),
};
