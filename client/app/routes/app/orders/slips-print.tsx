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
    () => (searchParams.get("orderIds") ?? "").split(",").filter(Boolean),
    [searchParams],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: orderKeys.slipData(orderIds),
    queryFn: () => orderService.slipData(orderIds),
    enabled: orderIds.length > 0,
  });
  const { store, isLoading: storeLoading } = useSlipStore();

  if (orderIds.length === 0) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        No orders selected. Open this page from the Orders list with rows selected.
      </div>
    );
  }

  // Error before loading: a failed request leaves isLoading false and data
  // undefined, which would otherwise render an empty sheet that looks like a
  // successful print of nothing.
  if (isError) {
    return (
      <div className="p-8 text-sm text-red-700">
        Could not load these orders. Go back to the Orders list and try again.
      </div>
    );
  }

  if (isLoading || storeLoading || !data) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading slips…
      </div>
    );
  }

  return (
    <PackageSlipSheet
      orders={data}
      store={store}
      storageKey="package-slip-batch-opts"
      defaultPaperId={SLIP_DEFAULT_PAPER_ID}
      defaultLayout={SLIP_BATCH_LAYOUT}
      backTo="/orders"
      backLabel="Back to orders"
    />
  );
}
