import { useQuery } from "@tanstack/react-query";
import { draftOrderService } from "~/services/draft-order.service";
import type { DraftOrderListParams } from "~/types/api";

/** React Query key factory for draft-order queries. */
export const draftOrderKeys = {
  all: ["draft-orders"] as const,
  list: (params?: DraftOrderListParams) =>
    [...draftOrderKeys.all, "list", params] as const,
  detail: (id: string) => [...draftOrderKeys.all, "detail", id] as const,
  stats: (params?: { channelId?: string }) =>
    [...draftOrderKeys.all, "stats", params] as const,
};

export function useDraftOrders(params?: DraftOrderListParams) {
  return useQuery({
    queryKey: draftOrderKeys.list(params),
    queryFn: () => draftOrderService.list(params),
  });
}

export function useDraftOrder(id?: string | null) {
  return useQuery({
    queryKey: draftOrderKeys.detail(id!),
    queryFn: () => draftOrderService.get(id!),
    enabled: !!id,
  });
}

/**
 * Aggregates for the KPI row and the filter-chip counts.
 *
 * Nests under `draftOrderKeys.all`, so every existing draft mutation already
 * invalidates it — no change needed in `use-draft-order-mutations`.
 */
export function useDraftOrderStats(params?: { channelId?: string }) {
  return useQuery({
    queryKey: draftOrderKeys.stats(params),
    queryFn: () => draftOrderService.stats(params),
  });
}
