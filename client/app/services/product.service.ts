import { apiClient } from "~/lib/api-client";
import type {
  PaginatedResponse,
  Product,
  ProductDetail,
  ProductListParams,
  ProductStatsResponse,
  CreateProductRequest,
  UpdateProductRequest,
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

  /** Create a CRM-native product on the MANUAL channel. */
  create: (data: CreateProductRequest) =>
    apiClient.post<ProductDetail>("/products", data).then((response) => response.data),

  /** Edit a MANUAL-channel product. Server returns 403 for SHOPIFY products. */
  update: (id: string, data: UpdateProductRequest) =>
    apiClient.patch<ProductDetail>(`/products/${id}`, data).then((response) => response.data),

  /** Soft-delete (archive) a MANUAL-channel product. */
  softDelete: (id: string) =>
    apiClient
      .delete<{ id: string; deletedAt: string }>(`/products/${id}`)
      .then((response) => response.data),
};
