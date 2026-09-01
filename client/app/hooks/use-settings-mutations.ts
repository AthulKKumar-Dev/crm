import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { organizationSettingsService } from "~/services/organization-settings.service";
import { settingsKeys } from "~/hooks/use-settings-queries";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type {
  OrganizationSettingsResponse,
  UpdateProductSettingsRequest,
  UpdateOrderSettingsRequest,
  UpdateTaxSettingsRequest,
  UpdateInventorySettingsRequest,
} from "~/types/api";

/**
 * PATCH /organization/settings/products — merge-patch product settings.
 *
 * Uses an optimistic update so the toggle in the UI flips immediately on
 * click instead of waiting for the round-trip. On error we roll back to the
 * pre-mutation snapshot, on success we invalidate to pick up any server-side
 * canonicalization (defaults, future computed fields). The shared cache key
 * means two rapid mutations (e.g. flipping two different toggles back-to-back)
 * compose correctly — each sees the previous optimistic state as its baseline.
 */
export function useUpdateProductSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateProductSettingsRequest) =>
      organizationSettingsService.updateProductSettings(data),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.all });
      const previous = queryClient.getQueryData<OrganizationSettingsResponse>(
        settingsKeys.all,
      );
      if (previous) {
        queryClient.setQueryData<OrganizationSettingsResponse>(
          settingsKeys.all,
          {
            ...previous,
            productSettings: { ...previous.productSettings, ...patch },
          },
        );
      }
      return { previous };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsKeys.all, context.previous);
      }
      handleMutationError(error, "Failed to update product settings.");
    },
    onSuccess: () => {
      toast.success("Product settings updated.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}

/**
 * PATCH /organization/settings/orders — merge-patch order settings.
 * Same optimistic / rollback pattern as the product version.
 */
export function useUpdateOrderSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateOrderSettingsRequest) =>
      organizationSettingsService.updateOrderSettings(data),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.all });
      const previous = queryClient.getQueryData<OrganizationSettingsResponse>(
        settingsKeys.all,
      );
      if (previous) {
        queryClient.setQueryData<OrganizationSettingsResponse>(
          settingsKeys.all,
          {
            ...previous,
            orderSettings: { ...previous.orderSettings, ...patch },
          },
        );
      }
      return { previous };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsKeys.all, context.previous);
      }
      handleMutationError(error, "Failed to update order settings.");
    },
    onSuccess: () => {
      toast.success("Order settings updated.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}

/**
 * PATCH /organization/settings/inventory — merge-patch inventory settings.
 * Same optimistic / rollback pattern as the two above.
 *
 * Unlike products and orders, this endpoint is role-gated server-side
 * (`@Roles(...ORG_MANAGERS)`), so a VIEWER gets a 403 — `handleMutationError`
 * surfaces it and the optimistic update rolls back.
 */
export function useUpdateInventorySettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateInventorySettingsRequest) =>
      organizationSettingsService.updateInventorySettings(data),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.all });
      const previous = queryClient.getQueryData<OrganizationSettingsResponse>(
        settingsKeys.all,
      );
      if (previous) {
        queryClient.setQueryData<OrganizationSettingsResponse>(
          settingsKeys.all,
          {
            ...previous,
            inventorySettings: { ...previous.inventorySettings, ...patch },
          },
        );
      }
      return { previous };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsKeys.all, context.previous);
      }
      handleMutationError(error, "Failed to update inventory settings.");
    },
    onSuccess: () => {
      toast.success("Inventory settings updated.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}

/**
 * PATCH /organization/settings/tax — merge-patch GST/tax settings.
 *
 * Same optimistic shape as its siblings. Worth noting what these two values do:
 * the B2CL threshold moves invoices between GSTR-1 table 5 and table 7, and the
 * default UQC appears on every table 12 row — both change statutory output, so
 * the route is role-gated server-side.
 */
export function useUpdateTaxSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateTaxSettingsRequest) =>
      organizationSettingsService.updateTaxSettings(data),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.all });
      const previous = queryClient.getQueryData<OrganizationSettingsResponse>(
        settingsKeys.all,
      );
      if (previous) {
        queryClient.setQueryData<OrganizationSettingsResponse>(
          settingsKeys.all,
          { ...previous, taxSettings: { ...previous.taxSettings, ...patch } },
        );
      }
      return { previous };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsKeys.all, context.previous);
      }
      handleMutationError(error, "Failed to update tax settings.");
    },
    onSuccess: () => {
      toast.success("Tax settings updated.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}
