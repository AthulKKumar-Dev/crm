import { apiClient } from "~/lib/api-client";
import type {
  OrganizationSettingsResponse,
  ProductSettings,
  OrderSettings,
  UpdateProductSettingsRequest,
  UpdateOrderSettingsRequest,
} from "~/types/api";

/**
 * Client for per-organization settings. Today there are two domains —
 * `productSettings` and `orderSettings` — but the surface area is designed
 * so future domains (customer, inventory, etc.) plug in by adding a new
 * column on the server and a new method here.
 */
export const organizationSettingsService = {
  get: () =>
    apiClient
      .get<OrganizationSettingsResponse>("/organization/settings")
      .then((response) => response.data),

  updateProductSettings: (data: UpdateProductSettingsRequest) =>
    apiClient
      .patch<ProductSettings>("/organization/settings/products", data)
      .then((response) => response.data),

  updateOrderSettings: (data: UpdateOrderSettingsRequest) =>
    apiClient
      .patch<OrderSettings>("/organization/settings/orders", data)
      .then((response) => response.data),
};
