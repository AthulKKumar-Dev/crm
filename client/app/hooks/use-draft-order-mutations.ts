import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { draftOrderService } from "~/services/draft-order.service";
import { draftOrderKeys } from "~/hooks/use-draft-order-queries";
import { orderKeys } from "~/hooks/use-order-queries";
import { invoiceKeys } from "~/hooks/use-invoice-queries";
import { customerKeys } from "~/hooks/use-customer-queries";
import { productKeys } from "~/hooks/use-product-queries";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type {
  CreateDraftOrderRequest,
  UpdateDraftOrderRequest,
  CompleteDraftRequest,
  SendDraftInvoiceRequest,
} from "~/types/api";

function invalidateDrafts(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: draftOrderKeys.all });
}

export function useCreateDraftOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDraftOrderRequest) => draftOrderService.create(data),
    onSuccess: (draft) => {
      invalidateDrafts(queryClient);
      toast.success(`Draft saved${draft.name ? ` (${draft.name})` : ""}.`);
    },
    onError: (error) => handleMutationError(error, "Failed to save draft."),
  });
}

export function useUpdateDraftOrderMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateDraftOrderRequest) =>
      draftOrderService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: draftOrderKeys.detail(id) });
      invalidateDrafts(queryClient);
      toast.success("Draft updated.");
    },
    onError: (error) => handleMutationError(error, "Failed to update draft."),
  });
}

export function useDeleteDraftOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => draftOrderService.softDelete(id),
    onSuccess: () => {
      invalidateDrafts(queryClient);
      toast.success("Draft deleted.");
    },
    onError: (error) => handleMutationError(error, "Failed to delete draft."),
  });
}

/**
 * Convert a draft into a real Order. Invalidates draft + order + customer +
 * invoice + product caches because all of those can change as a side effect
 * of completion (customer counters, inventory, invoice, etc.).
 */
export function useCompleteDraftOrderMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CompleteDraftRequest) =>
      draftOrderService.complete(id, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: draftOrderKeys.all });
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: productKeys.all });
      if (result.invoiceError) {
        toast.success(
          `Draft completed as ${result.order.name}. Invoice skipped: ${result.invoiceError}`,
        );
      } else if (result.invoice) {
        toast.success(`Draft completed as ${result.order.name} with invoice.`);
      } else {
        toast.success(`Draft completed as ${result.order.name}.`);
      }
    },
    onError: (error) =>
      handleMutationError(error, "Failed to complete draft."),
  });
}

export function useSendDraftInvoiceMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SendDraftInvoiceRequest) =>
      draftOrderService.sendInvoice(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: draftOrderKeys.detail(id) });
      invalidateDrafts(queryClient);
      toast.success("Invoice sent.");
    },
    onError: (error) =>
      handleMutationError(error, "Failed to send invoice."),
  });
}
