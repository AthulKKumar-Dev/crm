import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  analyticsService,
  type AnalyticsQueryParams,
} from "~/services/analytics.service";

/** React Query key factory for the analytics page. */
export const analyticsKeys = {
  all: ["analytics"] as const,
  overview: (params?: AnalyticsQueryParams) =>
    [...analyticsKeys.all, "overview", params] as const,
};

/** Fetch the analytics overview (stats, trend, channel breakdown). */
export function useAnalyticsOverview(params?: AnalyticsQueryParams) {
  return useQuery({
    queryKey: analyticsKeys.overview(params),
    queryFn: () => analyticsService.getOverview(params),
  });
}

/** Trigger an on-demand Shopify analytics refresh for the current org. */
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

      // Surface per-channel errors so the user can see WHY data isn't loading
      // (missing scope, plan tier, etc.) without digging through server logs.
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
