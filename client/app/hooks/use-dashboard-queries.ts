import { useQuery } from "@tanstack/react-query";
import { useExclusiveDownload } from "~/hooks/use-exclusive-download";
import { dashboardService } from "~/services/dashboard.service";
import type { DashboardQueryParams } from "~/types/api";

/** React Query key factory for all dashboard-related queries. */
export const dashboardKeys = {
  all: ["dashboard"] as const,
  overview: (params?: DashboardQueryParams) =>
    [...dashboardKeys.all, "overview", params] as const,
  salesAndProfit: (params?: DashboardQueryParams) =>
    [...dashboardKeys.all, "sales-and-profit", params] as const,
  salesByCategory: (params?: DashboardQueryParams) =>
    [...dashboardKeys.all, "sales-by-category", params] as const,
};

/** Fetch the dashboard overview (stats, top products, recent orders). */
export function useDashboard(params?: DashboardQueryParams) {
  return useQuery({
    queryKey: dashboardKeys.overview(params),
    queryFn: () => dashboardService.getOverview(params),
  });
}

/**
 * Sales and gross profit for the selected window.
 *
 * Drives the stat cards AND the bar chart. Both must pass the SAME params or
 * React Query hands them two different responses and the page goes back to
 * showing a headline figure that disagrees with the bars underneath it.
 */
export function useSalesAndProfit(params?: DashboardQueryParams) {
  return useQuery({
    queryKey: dashboardKeys.salesAndProfit(params),
    queryFn: () => dashboardService.getSalesAndProfit(params),
  });
}

/** Fetch sales breakdown by product type for the donut chart. */
export function useSalesByCategory(params?: DashboardQueryParams) {
  return useQuery({
    queryKey: dashboardKeys.salesByCategory(params),
    queryFn: () => dashboardService.getSalesByCategory(params),
  });
}

export type DashboardExportKind = "csv" | "json";

/**
 * Dashboard downloads (CSV / JSON), one at a time — `exporting` names the one
 * in flight. The lock itself lives in `useExclusiveDownload`.
 */
export function useExportDashboard() {
  const { running: exporting, run } = useExclusiveDownload<DashboardExportKind>();

  const exportCsv = (params?: DashboardQueryParams) =>
    run(
      "csv",
      () => dashboardService.exportCsv(params),
      "orders-report.csv",
      "Couldn't export the CSV. Please try again.",
    );

  const exportJson = (params?: DashboardQueryParams) =>
    run(
      "json",
      () => dashboardService.exportJson(params),
      "dashboard-report.json",
      "Couldn't download the report. Please try again.",
    );

  return { exportCsv, exportJson, exporting };
}
