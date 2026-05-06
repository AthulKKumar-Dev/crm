import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { orderService } from "~/services/order.service";
import { orderKeys } from "~/hooks/use-order-queries";
import { customerKeys } from "~/hooks/use-customer-queries";
import { productKeys } from "~/hooks/use-product-queries";
import { invoiceKeys } from "~/hooks/use-invoice-queries";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type { CreateOfflineOrderRequest } from "~/types/api";

/** Mutation hook for creating an offline (in-store) order with auto-invoice. */
export function useCreateOfflineOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOfflineOrderRequest) =>
      orderService.createOffline(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      queryClient.invalidateQueries({ queryKey: productKeys.all });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      if (result.invoice) {
        toast.success(`Order ${result.order.name} created with invoice.`);
      } else if (result.invoiceError) {
        toast.success(
          `Order ${result.order.name} created. Invoice skipped: ${result.invoiceError}`,
        );
      } else {
        toast.success(`Order ${result.order.name} created.`);
      }
    },
    onError: (error) =>
      handleMutationError(error, "Failed to create offline order."),
  });
}
