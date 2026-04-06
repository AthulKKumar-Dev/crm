import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { channelService } from "~/services/channel.service";
import { channelKeys } from "~/hooks/use-channel-queries";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type { UpdateChannelRequest, TriggerSyncRequest, ShopifyInstallRequest } from "~/types/api";

/** Mutation hook for updating a channel's settings. */
export function useUpdateChannelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateChannelRequest }) =>
      channelService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: channelKeys.all });
      toast.success("Channel updated.");
    },
    onError: (error) => handleMutationError(error, "Failed to update channel."),
  });
}

/** Mutation hook for disconnecting a channel. */
export function useDisconnectChannelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => channelService.disconnect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: channelKeys.all });
      toast.success("Channel disconnected.");
    },
    onError: (error) => handleMutationError(error, "Failed to disconnect channel."),
  });
}

/** Mutation hook for triggering a manual sync on a channel. */
export function useTriggerSyncMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TriggerSyncRequest }) =>
      channelService.triggerSync(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: channelKeys.detail(variables.id) });
      toast.success("Sync started.");
    },
    onError: (error) => handleMutationError(error, "Failed to start sync."),
  });
}

/** Mutation hook for starting Shopify OAuth flow. Redirects to Shopify on success. */
export function useInstallShopifyMutation() {
  return useMutation({
    mutationFn: (data: ShopifyInstallRequest) => channelService.installShopify(data),
    onSuccess: (response) => {
      window.location.href = response.authUrl;
    },
    onError: (error) => handleMutationError(error, "Failed to start Shopify connection."),
  });
}

/** Mutation hook for starting Instagram OAuth flow. Redirects to Meta on success. */
export function useInstallInstagramMutation() {
  return useMutation({
    mutationFn: () => channelService.installInstagram(),
    onSuccess: (response) => {
      window.location.href = response.authUrl;
    },
    onError: (error) => handleMutationError(error, "Failed to start Instagram connection."),
  });
}
