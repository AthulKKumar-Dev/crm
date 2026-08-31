import { useQuery } from "@tanstack/react-query";
import { invoiceService } from "~/services/invoice.service";
import type { InvoiceListParams, GstReturnParams } from "~/types/api";

/** React Query key factory for all invoice-related queries. */
export const invoiceKeys = {
  all: ["invoices"] as const,
  list: (params?: InvoiceListParams) =>
    [...invoiceKeys.all, "list", params] as const,
  detail: (id: string) =>
    [...invoiceKeys.all, "detail", id] as const,
  stats: (params?: { financialYear?: string }) =>
    [...invoiceKeys.all, "stats", params] as const,
  gstReturn: (params: GstReturnParams) =>
    [...invoiceKeys.all, "gst-return", params] as const,
};

/** Fetch a paginated list of invoices with optional filters. */
export function useInvoices(params?: InvoiceListParams) {
  return useQuery({
    queryKey: invoiceKeys.list(params),
    queryFn: () => invoiceService.list(params),
  });
}

/** Fetch a single invoice by ID. */
export function useInvoice(id?: string | null) {
  return useQuery({
    queryKey: invoiceKeys.detail(id!),
    queryFn: () => invoiceService.get(id!),
    enabled: !!id,
  });
}

/** Fetch GST return summary (GSTR-1 or GSTR-3B). */
export function useGstReturn(params: GstReturnParams | null) {
  return useQuery({
    queryKey: invoiceKeys.gstReturn(params!),
    queryFn: () => invoiceService.getGstReturn(params!),
    enabled: !!params?.financialYear && !!params?.period,
  });
}

/** Aggregates for the KPI row and the filter-chip counts. */
export function useInvoiceStats(params?: { financialYear?: string }) {
  return useQuery({
    queryKey: invoiceKeys.stats(params),
    queryFn: () => invoiceService.stats(params),
  });
}
