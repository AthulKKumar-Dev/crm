import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invoiceService } from "~/services/invoice.service";
import { invoiceKeys } from "~/hooks/use-invoice-queries";
import { orderKeys } from "~/hooks/use-order-queries";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type { CreateInvoiceRequest } from "~/types/api";

/** Mutation hook for generating a GST invoice from an order. */
export function useCreateInvoiceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateInvoiceRequest) => invoiceService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      // The order detail embeds its live invoice — refresh it so the invoice
      // card appears and the Generate button hides.
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      toast.success("GST invoice generated successfully.");
    },
    onError: (error) =>
      handleMutationError(error, "Failed to generate invoice."),
  });
}

/** Mutation hook for cancelling an issued invoice. */
export function useCancelInvoiceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invoiceService.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      // Cancelling frees the one-live-invoice slot — refresh order detail so
      // the Generate button reappears.
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      toast.success("Invoice cancelled.");
    },
    onError: (error) =>
      handleMutationError(error, "Failed to cancel invoice."),
  });
}
