import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { organizationSettingsService } from "~/services/organization-settings.service";
import { settingsKeys } from "~/hooks/use-settings-queries";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type {
  UpdateProductSettingsRequest,
  UpdateOrderSettingsRequest,
} from "~/types/api";

/** PATCH /organization/settings/products — merge-patch product settings. */
export function useUpdateProductSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateProductSettingsRequest) =>
      organizationSettingsService.updateProductSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      toast.success("Product settings updated.");
    },
    onError: (error) =>
      handleMutationError(error, "Failed to update product settings."),
  });
}

/** PATCH /organization/settings/orders — merge-patch order settings. */
export function useUpdateOrderSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateOrderSettingsRequest) =>
      organizationSettingsService.updateOrderSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      toast.success("Order settings updated.");
    },
    onError: (error) =>
      handleMutationError(error, "Failed to update order settings."),
  });
}
