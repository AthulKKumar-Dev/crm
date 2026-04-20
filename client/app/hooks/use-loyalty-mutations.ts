import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "~/lib/api-client";
import { customerKeys } from "~/hooks/use-customer-queries";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type { RecomputeLoyaltyResponse } from "~/types/api";

/**
 * Triggers a server-side re-evaluation of every customer's vipLevel against
 * the organization's current loyalty thresholds. Invalidates customer queries
 * on success so the tier badges + stats breakdown refresh in place.
 */
export function useRecomputeLoyaltyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.post<RecomputeLoyaltyResponse>("/loyalty/recompute").then((response) => response.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      toast.success(`Updated ${data.updated} of ${data.total} customers.`);
    },
    onError: (error) => handleMutationError(error, "Failed to recompute loyalty tiers."),
  });
}
