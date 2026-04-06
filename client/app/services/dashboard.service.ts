import { apiClient } from "~/lib/api-client";
import type { DashboardOverview, DashboardQueryParams } from "~/types/api";

export const dashboardService = {
  getOverview: (params?: DashboardQueryParams) =>
    apiClient
      .get<DashboardOverview>("/dashboard", { params })
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
