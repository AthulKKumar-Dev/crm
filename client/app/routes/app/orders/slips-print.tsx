import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PackageSlipSheet } from "~/components/app/package-slip-sheet";
import { useSlipStore } from "~/hooks/use-slip-store";
import { orderKeys } from "~/hooks/use-order-queries";
import { orderService } from "~/services/order.service";
import { SLIP_BATCH_LAYOUT, SLIP_DEFAULT_PAPER_ID } from "~/lib/slip-stock";

/**
 * Batch package-slip printing — many orders in one job, N-up.
 *
 * Reached from the orders list with rows selected. The path ends in `/print`,
 * which is what makes the app layout render it chrome-free (see the regex in
 * `routes/app/_layout.tsx`); AuthGuard still gates it.
 *
 * Client-fetched via React Query rather than a loader, matching every other
 * print route in this app.
 */
export function meta() {
  return [{ title: "Package slips | Collabo CRM" }];
}

export default function SlipsPrintRoute() {
  const [searchParams] = useSearchParams();
  const orderIds = useMemo(
    // De-duplicated: the editor compares how many it asked for with how many
    // came back, and a repeated id would read as an order that failed to load.
    () => [...new Set((searchParams.get("orderIds") ?? "").split(",").filter(Boolean))],
    [searchParams],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: orderKeys.slipData(orderIds),
    queryFn: () => orderService.slipData(orderIds),
    enabled: orderIds.length > 0,
  });
  const { store, isLoading: storeLoading } = useSlipStore();

  // Error before loading: a failed request leaves isLoading false and data
  // undefined, which would otherwise read as still loading forever.
  const status =
    orderIds.length === 0
      ? "empty"
      : isError
        ? "error"
        : isLoading || storeLoading || !data
          ? "loading"
          : "ready";

  return (
    <PackageSlipSheet
      mode="batch"
      status={status}
      onRetry={() => refetch()}
      orders={status === "ready" && data ? data : []}
      requestedCount={orderIds.length}
      store={store}
      storageKey="package-slip-batch-opts"
      defaultPaperId={SLIP_DEFAULT_PAPER_ID}
      defaultLayout={SLIP_BATCH_LAYOUT}
      backTo="/orders"
      backLabel="Back to orders"
    />
  );
}
