import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invoiceService } from "~/services/invoice.service";
import { invoiceKeys } from "~/hooks/use-invoice-queries";
import { orderKeys } from "~/hooks/use-order-queries";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type {
  CreateCreditNoteRequest,
  MarkFiledRequest, CreateInvoiceRequest } from "~/types/api";

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

/**
 * POST /invoices/:id/credit-note — reverse an issued invoice.
 *
 * The statutory correction, and the one that was missing entirely: refunds
 * carried no tax at all, so a refunded sale stayed 100% in declared output
 * liability for ever. Unlike cancelling, a credit note is additive and leaves a
 * trail — the original invoice stays in the return and the note nets against it.
 */
export function useCreateCreditNoteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateCreditNoteRequest }) =>
      invoiceService.createCreditNote(id, data),
    onSuccess: (note) => {
      // The note changes the list, the stats and every return for its period.
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      toast.success(`Credit note ${note.invoiceNumber} raised.`);
    },
    onError: (error) =>
      handleMutationError(error, "Failed to raise the credit note."),
  });
}

/**
 * POST /invoices/gst-return/filings — record a filing, locking the period.
 *
 * Locking is the point: until this existed, issuing or cancelling an invoice
 * inside an already-filed month silently rewrote what had gone to the
 * government.
 */
export function useMarkFiledMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MarkFiledRequest) => invoiceService.markFiled(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      toast.success("Period marked as filed and locked.");
    },
    onError: (error) => handleMutationError(error, "Failed to record the filing."),
  });
}

/** DELETE /invoices/gst-return/filings/:id — reopen a period filed in error. */
export function useUnfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invoiceService.unfile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      toast.success("Period reopened.");
    },
    onError: (error) => handleMutationError(error, "Failed to reopen the period."),
  });
}
