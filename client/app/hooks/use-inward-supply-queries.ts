import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inwardSupplyService } from "~/services/inward-supply.service";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type { UpsertInwardSupplyRequest } from "~/types/api";

export const inwardSupplyKeys = {
  all: ["inward-supplies"] as const,
  period: (financialYear: string, period: string) =>
    [...inwardSupplyKeys.all, financialYear, period] as const,
};

/** Gateway fees recorded against one filing period. */
export function useInwardSupplies(financialYear: string, period: string, enabled = true) {
  return useQuery({
    queryKey: inwardSupplyKeys.period(financialYear, period),
    queryFn: () => inwardSupplyService.list(financialYear, period),
    enabled,
  });
}

/**
 * Create or correct a supplier's figure.
 *
 * Invalidates only this period's key — a fee touches no return total, so there
 * is nothing on the invoice or GST side to refetch.
 */
export function useUpsertInwardSupplyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpsertInwardSupplyRequest) => inwardSupplyService.upsert(data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: inwardSupplyKeys.period(variables.financialYear, variables.period),
      });
      toast.success("Payment fee saved.");
    },
    onError: (error) => handleMutationError(error, "Could not save the payment fee."),
  });
}

export function useDeleteInwardSupplyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => inwardSupplyService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inwardSupplyKeys.all });
      toast.success("Payment fee removed.");
    },
    onError: (error) => handleMutationError(error, "Could not remove the payment fee."),
  });
}
