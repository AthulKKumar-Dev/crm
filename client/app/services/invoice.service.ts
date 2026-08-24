import { apiClient } from "~/lib/api-client";
import type {
  PaginatedResponse,
  Invoice,
  InvoiceDetail,
  CreateInvoiceRequest,
  InvoiceListParams,
  InvoiceStats,
  GstReturnParams,
  GstReturnGstr1,
  GstReturnGstr3B,
} from "~/types/api";

/**
 * Service layer for invoice and GST return endpoints.
 */
export const invoiceService = {
  /** Generate a GST invoice for an order. */
  create: (data: CreateInvoiceRequest) =>
    apiClient
      .post<InvoiceDetail>("/invoices", data)
      .then((res) => res.data),

  /** List invoices with pagination and filtering. */
  list: (params?: InvoiceListParams) =>
    apiClient
      .get<PaginatedResponse<Invoice>>("/invoices", { params })
      .then((res) => res.data),

  /** Aggregates for the KPI row and filter-chip counts. */
  stats: (params?: { financialYear?: string }) =>
    apiClient
      .get<InvoiceStats>("/invoices/stats", { params })
      .then((res) => res.data),

  /** Get full invoice detail. */
  get: (id: string) =>
    apiClient
      .get<InvoiceDetail>(`/invoices/${id}`)
      .then((res) => res.data),

  /** Cancel an issued invoice. */
  cancel: (id: string) =>
    apiClient
      .post<Invoice>(`/invoices/${id}/cancel`)
      .then((res) => res.data),

  /** Get GST return summary (GSTR-1 or GSTR-3B). */
  getGstReturn: (params: GstReturnParams) =>
    apiClient
      .get<GstReturnGstr1 | GstReturnGstr3B>("/invoices/gst-return", {
        params,
      })
      .then((res) => res.data),

  /** Export invoices as CSV (returns blob). */
  exportCsv: (params?: InvoiceListParams) =>
    apiClient
      .get("/invoices/export/csv", {
        params,
        responseType: "blob",
      })
      .then((res) => res.data),

  /** Export invoices as JSON. */
  exportJson: (params?: InvoiceListParams) =>
    apiClient
      .get("/invoices/export/json", { params })
      .then((res) => res.data),

  /** Download GST return (GSTR-1 or GSTR-3B) as CSV blob. */
  exportGstReturnCsv: (params: GstReturnParams) =>
    apiClient
      .get("/invoices/gst-return/export/csv", {
        params,
        responseType: "blob",
      })
      .then((res) => res.data),
};
