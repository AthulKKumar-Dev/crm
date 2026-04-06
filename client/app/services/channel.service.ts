import { apiClient } from "~/lib/api-client";
import type {
  Channel,
  ChannelDetail,
  UpdateChannelRequest,
  TriggerSyncRequest,
  ShopifyInstallRequest,
  OAuthInstallResponse,
} from "~/types/api";

/**
 * Service layer for channel API endpoints.
 *
 * Each method returns the unwrapped response data (the API client
 * already strips the `{ success, data }` envelope).
 */
export const channelService = {
  list: () =>
    apiClient.get<Channel[]>("/channels").then((response) => response.data),

  get: (id: string) =>
    apiClient.get<ChannelDetail>(`/channels/${id}`).then((response) => response.data),

  update: (id: string, data: UpdateChannelRequest) =>
    apiClient.patch<Channel>(`/channels/${id}`, data).then((response) => response.data),

  disconnect: (id: string) =>
    apiClient.delete<{ message: string }>(`/channels/${id}`).then((response) => response.data),

  triggerSync: (id: string, data: TriggerSyncRequest) =>
    apiClient.post<{ message: string; jobId: string }>(`/channels/${id}/sync`, data).then((response) => response.data),

  installShopify: (data: ShopifyInstallRequest) =>
    apiClient.post<OAuthInstallResponse>("/channels/shopify/install", data).then((response) => response.data),

  installInstagram: () =>
    apiClient.post<OAuthInstallResponse>("/channels/instagram/install").then((response) => response.data),
};
