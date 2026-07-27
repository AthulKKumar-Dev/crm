import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  analyticsService,
  type AnalyticsQueryParams,
} from "~/services/analytics.service";

/** React Query key factory for the analytics page. */
export const analyticsKeys = {
  all: ["analytics"] as const,
  dashboard: (params?: AnalyticsQueryParams) =>
    [...analyticsKeys.all, "dashboard", params] as const,
};

/** Fetch the pixel-first analytics dashboard. */
export function useAnalyticsDashboard(params?: AnalyticsQueryParams) {
  return useQuery({
    queryKey: analyticsKeys.dashboard(params),
    queryFn: () => analyticsService.getDashboard(params),
  });
}

/** Trigger an on-demand analytics refresh (ShopifyQL + pixel rollup). */
export function useRefreshAnalytics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params?: AnalyticsQueryParams) =>
      analyticsService.refresh(params),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: analyticsKeys.all });

      if (result.refreshed === 0) {
        toast.error("No connected Shopify channel to refresh.");
        return;
      }

      const errored = result.results.filter((r) => r.error);
      if (errored.length > 0) {
        const first = errored[0];
        toast.warning(`Analytics fell back to local data. ${first.error}`, {
          duration: 10000,
        });
      } else {
        const totalActiveDays = result.results.reduce(
          (sum, r) => sum + r.snapshotsWritten,
          0,
        );
        toast.success(
          `Analytics refreshed for ${result.refreshed} channel${result.refreshed === 1 ? "" : "s"}. ` +
            `${totalActiveDays} day${totalActiveDays === 1 ? "" : "s"} of activity in the selected window.`,
        );
      }
    },
    onError: () => {
      toast.error("Could not refresh analytics. Try again in a moment.");
    },
  });
}
