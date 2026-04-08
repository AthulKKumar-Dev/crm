import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invoiceService } from "~/services/invoice.service";
import { invoiceKeys } from "~/hooks/use-invoice-queries";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type { CreateInvoiceRequest } from "~/types/api";

/** Mutation hook for generating a GST invoice from an order. */
export function useCreateInvoiceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateInvoiceRequest) => invoiceService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
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
      toast.success("Invoice cancelled.");
    },
    onError: (error) =>
      handleMutationError(error, "Failed to cancel invoice."),
  });
}
