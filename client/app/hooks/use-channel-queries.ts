import { useQuery } from "@tanstack/react-query";
import { channelService } from "~/services/channel.service";

/** React Query key factory for all channel-related queries. */
export const channelKeys = {
  all: ["channels"] as const,
  list: () => [...channelKeys.all, "list"] as const,
  detail: (id: string) => [...channelKeys.all, "detail", id] as const,
};

/** Fetch all connected channels for the current organization. */
export function useChannels() {
  return useQuery({
    queryKey: channelKeys.list(),
    queryFn: () => channelService.list(),
  });
}

/** Fetch a single channel by ID with sync logs. */
export function useChannel(id?: string | null) {
  return useQuery({
    queryKey: channelKeys.detail(id!),
    queryFn: () => channelService.get(id!),
    enabled: !!id,
  });
}
