import { apiClient } from "~/lib/api-client";
import type {
  PaginatedResponse,
  Order,
  OrderDetail,
  OrderListParams,
  OrderStatsResponse,
  DashboardQueryParams,
} from "~/types/api";

/**
 * Service layer for order API endpoints.
 *
 * Each method returns the unwrapped response data (the API client
 * already strips the `{ success, data }` envelope).
 */
export const orderService = {
  list: (params?: OrderListParams) =>
    apiClient.get<PaginatedResponse<Order>>("/orders", { params }).then((response) => response.data),

  get: (id: string) =>
    apiClient.get<OrderDetail>(`/orders/${id}`).then((response) => response.data),

  stats: (params?: DashboardQueryParams) =>
    apiClient.get<OrderStatsResponse>("/orders/stats", { params }).then((response) => response.data),
};
