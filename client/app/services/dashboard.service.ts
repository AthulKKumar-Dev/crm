import { apiClient } from "~/lib/api-client";
import type { DashboardOverview, DashboardQueryParams, StatMetric } from "~/types/api";

/** One month of the rolling 12-month series behind the profit chart. */
export interface MonthlySalesPoint {
  month: string;
  revenue: number;
  profit: number;
  /** Orders placed that month — the Total Orders sparkline. */
  orders: number;
  /** Customers first seen that month — the Total Customers sparkline. */
  newCustomers: number;
}

export interface MonthlySalesData {
  data: MonthlySalesPoint[];
  totalRevenue: number;
  totalProfit: number;
  /**
   * Profit over the last 30 days against the 30 before it. Distinct from the
   * 12-month `totalProfit` above, so anything rendering it needs to say which
   * period it covers. `previous: 0` means there is no comparison period yet.
   */
  profitTrend: StatMetric;
}

export interface SalesByCategoryData {
  data: Array<{ name: string; value: number; color: string }>;
  total: number;
}

export const dashboardService = {
  getOverview: (params?: DashboardQueryParams) =>
    apiClient
      .get<DashboardOverview>("/dashboard", { params })
      .then((response) => response.data),

  getMonthlySales: (params?: DashboardQueryParams) =>
    apiClient
      .get<MonthlySalesData>("/dashboard/monthly-sales", { params })
      .then((response) => response.data),

  getSalesByCategory: (params?: DashboardQueryParams) =>
    apiClient
      .get<SalesByCategoryData>("/dashboard/sales-by-category", { params })
      .then((response) => response.data),

  exportCsv: (params?: DashboardQueryParams) =>
    apiClient
      .get<Blob>("/dashboard/export/csv", { params, responseType: "blob" })
      .then((response) => response.data),

  exportJson: (params?: DashboardQueryParams) =>
    apiClient
      .get<Blob>("/dashboard/export/json", { params, responseType: "blob" })
      .then((response) => response.data),
};
