import { useQuery } from "@tanstack/react-query";
import { orderService } from "~/services/order.service";
import type { OrderListParams } from "~/types/api";

/** React Query key factory for all order-related queries. */
export const orderKeys = {
  all: ["orders"] as const,
  list: (params?: OrderListParams) => [...orderKeys.all, "list", params] as const,
  detail: (id: string) => [...orderKeys.all, "detail", id] as const,
};

/** Fetch a paginated list of orders with optional filters. */
export function useOrders(params?: OrderListParams) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: () => orderService.list(params),
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
