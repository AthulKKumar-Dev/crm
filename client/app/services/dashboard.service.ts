import { apiClient } from "~/lib/api-client";
import type { DashboardOverview, DashboardQueryParams } from "~/types/api";

export interface MonthlySalesData {
  data: Array<{ month: string; revenue: number; profit: number }>;
  totalRevenue: number;
  totalProfit: number;
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
