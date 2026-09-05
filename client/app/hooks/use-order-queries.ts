import { useQuery } from "@tanstack/react-query";
import { orderService } from "~/services/order.service";
import type { OrderListParams, DashboardQueryParams } from "~/types/api";

/** React Query key factory for all order-related queries. */
export const orderKeys = {
  all: ["orders"] as const,
  list: (params?: OrderListParams) => [...orderKeys.all, "list", params] as const,
  detail: (id: string) => [...orderKeys.all, "detail", id] as const,
  stats: (params?: DashboardQueryParams) => [...orderKeys.all, "stats", params] as const,
  fulfillable: (id: string) => [...orderKeys.all, "fulfillable", id] as const,
  adjacent: (id: string) => [...orderKeys.all, "adjacent", id] as const,
  slipData: (ids: string[]) => [...orderKeys.all, "slip-data", ids] as const,
};

/** Fetch a paginated list of orders with optional filters. */
export function useOrders(params?: OrderListParams) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: () => orderService.list(params),
  });
}

/** Fetch period-over-period order stats (totals + change %). */
export function useOrderStats(params?: DashboardQueryParams) {
  return useQuery({
    queryKey: orderKeys.stats(params),
    queryFn: () => orderService.stats(params),
  });
}

/** Fetch a single order by ID. */
export function useOrder(id?: string | null) {
  return useQuery({
    queryKey: orderKeys.detail(id!),
    queryFn: () => orderService.get(id!),
    enabled: !!id,
  });
}

/**
 * Neighbours of an order for the detail page's Previous / Next rail.
 *
 * Replaces searching a client-side page of orders, which only fetched
 * UNFULFILLED ones — so on a fulfilled order both buttons were dead.
 */
export function useAdjacentOrders(id?: string | null) {
  return useQuery({
    queryKey: orderKeys.adjacent(id!),
    queryFn: () => orderService.adjacent(id!),
    enabled: !!id,
  });
}

/**
 * Fetch the line items still eligible for fulfillment, grouped by
 * fulfillment order (Shopify) or as one bucket (manual). Only invoked when
 * `enabled` is true so we don't hit Shopify on every page render.
 */
export function useFulfillableLineItems(id: string, enabled: boolean) {
  return useQuery({
    queryKey: orderKeys.fulfillable(id),
    queryFn: () => orderService.fulfillableLineItems(id),
    enabled,
    staleTime: 0,
  });
}
