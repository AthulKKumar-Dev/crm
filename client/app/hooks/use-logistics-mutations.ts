import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { handleMutationError } from "~/lib/handle-mutation-error";
import { logisticsService } from "~/services/logistics.service";
import { logisticsKeys } from "~/hooks/use-logistics-queries";
import type {
  BulkOrderActionRequest,
  CourierQuoteRequest,
  CreateShipmentRequest,
  PaginatedResponse,
  Shipment,
  ShipmentDetail,
  ShippableOrder,
} from "~/types/api";

/**
 * Writes for the logistics module.
 *
 * Follows `use-conversation-mutations.ts`: optimistic patch in `onMutate`,
 * restore in `onError` alongside `handleMutationError`, a `toast.success` in
 * `onSuccess`, and a blanket invalidate in `onSettled`.
 *
 * The blanket invalidate is deliberate. One shipment write moves the overview
 * counts, the tab counts and the list itself, and all three can be on screen at
 * once.
 */

function invalidateAll(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: logisticsKeys.all }).then(() => undefined);
}

/**
 * Patch one shipment across every cached list.
 *
 * `setQueriesData` on the list prefix rather than the active key, because the
 * user has usually visited several tabs and each is its own cache entry.
 */
function patchShipmentRows(queryClient: QueryClient, id: string, patch: Partial<Shipment>): void {
  queryClient.setQueriesData<PaginatedResponse<Shipment>>(
    { queryKey: [...logisticsKeys.shipments(), "list"] },
    (previous) =>
      previous
        ? { ...previous, data: previous.data.map((row) => (row.id === id ? { ...row, ...patch } : row)) }
        : previous,
  );
}

function patchOrderRows(
  queryClient: QueryClient,
  ids: string[],
  patch: Partial<ShippableOrder>,
): void {
  const targets = new Set(ids);
  queryClient.setQueriesData<PaginatedResponse<ShippableOrder>>(
    { queryKey: [...logisticsKeys.ordersToShip(), "list"] },
    (previous) =>
      previous
        ? {
            ...previous,
            data: previous.data.map((row) => (targets.has(row.id) ? { ...row, ...patch } : row)),
          }
        : previous,
  );
}

/* ─── Shipments ─────────────────────────────────────────────────────────── */

/**
 * Courier quotes.
 *
 * A mutation rather than a query even though it only reads: the request body is
 * the whole form state, and it should re-run when the merchant changes the
 * package — not be cached under a key nobody can reconstruct.
 */
export function useCourierQuotesMutation() {
  return useMutation({
    mutationFn: (data: CourierQuoteRequest) => logisticsService.quotes(data),
    onError: (error) => handleMutationError(error, "Could not fetch courier rates."),
  });
}

export function useCreateShipmentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateShipmentRequest) => logisticsService.createShipment(data),
    onSuccess: (result) => {
      const created = result.shipments[0];
      if (created) toast.success(`Shipment ${created.reference} created.`);
    },
    onError: (error) => handleMutationError(error, "Could not create the shipment."),
    onSettled: () => invalidateAll(queryClient),
  });
}

export function useGenerateAwbMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shipmentId: string) => logisticsService.generateAwb(shipmentId),
    onSuccess: (result) => {
      patchShipmentRows(queryClient, result.shipmentId, {
        awb: result.awb,
        trackingUrl: result.trackingUrl,
        status: "AWB_ASSIGNED",
      });
      queryClient.setQueryData<ShipmentDetail>(
        logisticsKeys.shipmentDetail(result.shipmentId),
        (previous) =>
          previous
            ? {
                ...previous,
                awb: result.awb,
                trackingUrl: result.trackingUrl,
                labelUrl: result.labelUrl,
                status: "AWB_ASSIGNED",
              }
            : previous,
      );
      toast.success(`AWB ${result.awb} generated.`);
    },
    // No rollback: nothing was patched optimistically, because an AWB is issued
    // by the courier and inventing one locally would show a number that does
    // not exist if the request then fails.
    onError: (error) => handleMutationError(error, "Could not generate the AWB."),
    onSettled: () => invalidateAll(queryClient),
  });
}

/* ─── Orders to ship ────────────────────────────────────────────────────── */

export function useBulkOrderActionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkOrderActionRequest) => logisticsService.bulkOrderAction(data),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: logisticsKeys.ordersToShip() });
      const snapshot = queryClient.getQueriesData<PaginatedResponse<ShippableOrder>>({
        queryKey: [...logisticsKeys.ordersToShip(), "list"],
      });

      if (variables.action === "HOLD") {
        patchOrderRows(queryClient, variables.orderIds, {
          status: "ON_HOLD",
          holdReason: variables.reason ?? "Put on hold by an operator",
        });
      } else if (variables.action === "RELEASE_HOLD") {
        patchOrderRows(queryClient, variables.orderIds, {
          status: "READY_TO_PROCESS",
          holdReason: null,
        });
      }

      return { snapshot };
    },
    onError: (error, _variables, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
      handleMutationError(error, "Could not update the order.");
    },
    onSuccess: (result, variables) => {
      toast.success(
        `${BULK_ORDER_VERB[variables.action]} ${result.updated} order${result.updated === 1 ? "" : "s"}.`,
      );
    },
    onSettled: () => invalidateAll(queryClient),
  });
}

const BULK_ORDER_VERB: Record<BulkOrderActionRequest["action"], string> = {
  HOLD: "Put on hold",
  RELEASE_HOLD: "Released",
  ASSIGN_LOCATION: "Assigned a pickup location to",
};
