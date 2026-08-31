import { apiClient } from "~/lib/api-client";
import type {
  OrganizationSettingsResponse,
  ProductSettings,
  OrderSettings,
  InventorySettings,
  UpdateProductSettingsRequest,
  UpdateOrderSettingsRequest,
  UpdateInventorySettingsRequest,
} from "~/types/api";

/**
 * Client for per-organization settings. Three domains — `productSettings`,
 * `orderSettings` and `inventorySettings` — each mapping to a JSONB column and
 * a PATCH endpoint on the server.
 *
 * Note the inventory PATCH is role-gated server-side (`@Roles(...ORG_MANAGERS)`)
 * where the other two are not; a VIEWER calling it gets a 403.
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

  updateInventorySettings: (data: UpdateInventorySettingsRequest) =>
    apiClient
      .patch<InventorySettings>("/organization/settings/inventory", data)
      .then((response) => response.data),
};
