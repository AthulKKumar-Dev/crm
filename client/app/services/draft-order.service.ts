import { apiClient } from "~/lib/api-client";
import type {
  PaginatedResponse,
  DraftOrder,
  DraftOrderDetail,
  DraftOrderListParams,
  CreateDraftOrderRequest,
  UpdateDraftOrderRequest,
  CompleteDraftRequest,
  CompleteDraftResponse,
  SendDraftInvoiceRequest,
  DraftOrderStats,
} from "~/types/api";

/**
 * Service layer for draft-order API endpoints. Returns unwrapped response
 * data (the API client already strips the `{ success, data }` envelope).
 */
export const draftOrderService = {
  list: (params?: DraftOrderListParams) =>
    apiClient
      .get<PaginatedResponse<DraftOrder>>("/draft-orders", { params })
      .then((r) => r.data),

  /** Org-wide aggregates for the KPI row and the filter chips. */
  stats: (params?: { channelId?: string }) =>
    apiClient
      .get<DraftOrderStats>("/draft-orders/stats", { params })
      .then((r) => r.data),

  get: (id: string) =>
    apiClient.get<DraftOrderDetail>(`/draft-orders/${id}`).then((r) => r.data),

  create: (data: CreateDraftOrderRequest) =>
    apiClient
      .post<DraftOrderDetail>("/draft-orders", data)
      .then((r) => r.data),

  update: (id: string, data: UpdateDraftOrderRequest) =>
    apiClient
      .patch<DraftOrderDetail>(`/draft-orders/${id}`, data)
      .then((r) => r.data),

  softDelete: (id: string) =>
    apiClient
      .delete<{ id: string; deletedAt: string }>(`/draft-orders/${id}`)
      .then((r) => r.data),

  complete: (id: string, data: CompleteDraftRequest) =>
    apiClient
      .post<CompleteDraftResponse>(`/draft-orders/${id}/complete`, data)
      .then((r) => r.data),

  sendInvoice: (id: string, data: SendDraftInvoiceRequest) =>
    apiClient
      .post<DraftOrderDetail>(`/draft-orders/${id}/send-invoice`, data)
      .then((r) => r.data),
};
