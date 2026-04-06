import { apiClient } from "~/lib/api-client";
import type {
  PaginatedResponse,
  Product,
  ProductDetail,
  ProductListParams,
  ProductStatsResponse,
} from "~/types/api";

/**
 * Service layer for product API endpoints.
 *
 * Each method returns the unwrapped response data (the API client
 * already strips the `{ success, data }` envelope).
 */
export const productService = {
  list: (params?: ProductListParams) =>
    apiClient.get<PaginatedResponse<Product>>("/products", { params }).then((response) => response.data),

  get: (id: string) =>
    apiClient.get<ProductDetail>(`/products/${id}`).then((response) => response.data),

  vendors: () =>
    apiClient.get<string[]>("/products/vendors").then((response) => response.data),

  types: () =>
    apiClient.get<string[]>("/products/types").then((response) => response.data),

  stats: (params?: { channelId?: string }) =>
    apiClient.get<ProductStatsResponse>("/products/stats", { params }).then((response) => response.data),
};
