import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { logisticsService } from "~/services/logistics.service";
import type { ShipmentListParams, ShippableOrderListParams } from "~/types/api";

export const logisticsKeys = {
  all: ["logistics"] as const,

  summary: () => [...logisticsKeys.all, "summary"] as const,
  overview: () => [...logisticsKeys.all, "overview"] as const,

  ordersToShip: () => [...logisticsKeys.all, "orders-to-ship"] as const,
  orderList: (params?: ShippableOrderListParams) =>
    [...logisticsKeys.ordersToShip(), "list", params ?? {}] as const,
  orderCounts: (params?: ShippableOrderListParams) =>
    [...logisticsKeys.ordersToShip(), "counts", params ?? {}] as const,
  ordersByIds: (ids: string[]) =>
    [...logisticsKeys.ordersToShip(), "by-ids", [...ids].sort().join(",")] as const,

  shipments: () => [...logisticsKeys.all, "shipments"] as const,
  shipmentList: (params?: ShipmentListParams) =>
    [...logisticsKeys.shipments(), "list", params ?? {}] as const,
  shipmentCounts: (params?: ShipmentListParams) =>
    [...logisticsKeys.shipments(), "counts", params ?? {}] as const,
  shipmentDetail: (id: string) => [...logisticsKeys.shipments(), "detail", id] as const,

  couriers: () => [...logisticsKeys.all, "couriers"] as const,
  locations: () => [...logisticsKeys.all, "locations"] as const,
};

/** Rosters that change on the order of weeks, not minutes. */
const ROSTER_STALE_TIME = 5 * 60_000;

/* ─── Dashboard ─────────────────────────────────────────────────────────── */

export function useLogisticsSummary() {
  return useQuery({
    queryKey: logisticsKeys.summary(),
    queryFn: () => logisticsService.summary(),
  });
}

export function useLogisticsOverview() {
  return useQuery({
    queryKey: logisticsKeys.overview(),
    queryFn: () => logisticsService.overview(),
  });
}

/* ─── Orders to ship ────────────────────────────────────────────────────── */

export function useShippableOrders(params?: ShippableOrderListParams) {
  return useQuery({
    queryKey: logisticsKeys.orderList(params),
    queryFn: () => logisticsService.listShippableOrders(params),
    // Without this, changing a tab blanks the table to a skeleton and the page
    // height collapses mid-interaction.
    placeholderData: keepPreviousData,
  });
}

/**
 * Tab counts.
 *
 * Keyed on the params *minus* `status`, so switching tabs does not refetch —
 * the numbers on the other tabs would be wrong if they did.
 */
export function useShippableOrderCounts(params?: ShippableOrderListParams) {
  const { status: _status, page: _page, ...rest } = params ?? {};
  return useQuery({
    queryKey: logisticsKeys.orderCounts(rest),
    queryFn: () => logisticsService.shippableOrderCounts(rest),
    placeholderData: keepPreviousData,
  });
}

export function useOrdersByIds(ids: string[]) {
  return useQuery({
    queryKey: logisticsKeys.ordersByIds(ids),
    queryFn: () => logisticsService.ordersByIds(ids),
    enabled: ids.length > 0,
  });
}

/* ─── Shipments ─────────────────────────────────────────────────────────── */

export function useShipments(params?: ShipmentListParams) {
  return useQuery({
    queryKey: logisticsKeys.shipmentList(params),
    queryFn: () => logisticsService.listShipments(params),
    placeholderData: keepPreviousData,
  });
}

export function useShipmentCounts(params?: ShipmentListParams) {
  const { group: _group, page: _page, ...rest } = params ?? {};
  return useQuery({
    queryKey: logisticsKeys.shipmentCounts(rest),
    queryFn: () => logisticsService.shipmentGroupCounts(rest),
    placeholderData: keepPreviousData,
  });
}

/**
 * One shipment, with its timeline.
 *
 * Polls only while the parcel is actually moving and stops on its own once it
 * is delivered — the same self-terminating idiom `use-conversation-queries.ts`
 * uses for in-flight messages. A fixed interval would keep refetching delivered
 * shipments forever.
 */
export function useShipmentDetail(id: string | undefined) {
  return useQuery({
    queryKey: logisticsKeys.shipmentDetail(id!),
    queryFn: () => logisticsService.shipmentDetail(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return false;
      const moving =
        status === "PICKED_UP" || status === "IN_TRANSIT" || status === "OUT_FOR_DELIVERY";
      return moving ? 30_000 : false;
    },
  });
}

/* ─── Setup rosters ─────────────────────────────────────────────────────── */

export function useCouriers() {
  return useQuery({
    queryKey: logisticsKeys.couriers(),
    queryFn: () => logisticsService.listCouriers(),
    staleTime: ROSTER_STALE_TIME,
  });
}

export function usePickupLocations() {
  return useQuery({
    queryKey: logisticsKeys.locations(),
    queryFn: () => logisticsService.listPickupLocations(),
    staleTime: ROSTER_STALE_TIME,
  });
}

/* ─── Section roll-ups ──────────────────────────────────────────────────── */

export function useReturnsOverview() {
  return useQuery({
    queryKey: [...logisticsKeys.all, "returns"] as const,
    queryFn: () => logisticsService.returnsOverview(),
  });
}

export function useCarriersOverview() {
  return useQuery({
    queryKey: [...logisticsKeys.all, "carriers-overview"] as const,
    queryFn: () => logisticsService.carriersOverview(),
    staleTime: ROSTER_STALE_TIME,
  });
}

export function useZonesOverview() {
  return useQuery({
    queryKey: [...logisticsKeys.all, "zones"] as const,
    queryFn: () => logisticsService.zonesOverview(),
    staleTime: ROSTER_STALE_TIME,
  });
}

export function useDeliveryAnalytics() {
  return useQuery({
    queryKey: [...logisticsKeys.all, "delivery-analytics"] as const,
    queryFn: () => logisticsService.deliveryAnalytics(),
  });
}
