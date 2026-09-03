import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
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

/** Imperative helpers for triggering dashboard exports (CSV / JSON). */
export function useExportDashboard() {
  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = async (params?: DashboardQueryParams) => {
    try {
      const blob = await dashboardService.exportCsv(params);
      download(blob, "orders-report.csv");
    } catch {
      toast.error("Failed to export CSV.");
    }
  };

  const exportJson = async (params?: DashboardQueryParams) => {
    try {
      const blob = await dashboardService.exportJson(params);
      download(blob, "dashboard-report.json");
    } catch {
      toast.error("Failed to export report.");
    }
  };

  return { exportCsv, exportJson };
}
