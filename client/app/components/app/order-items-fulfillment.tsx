import { Fragment, useState } from "react";
import { CheckCircle2, Clock, Loader2, MapPin, Package, PauseCircle, PlayCircle, Truck, Undo2 } from "lucide-react";
import {
  useSetItemsStatusMutation,
  useCreateFulfillmentMutation,
  useMarkDeliveredMutation,
  useUnfulfillMutation,
  useUpdateItemTrackingMutation,
} from "~/hooks/use-order-mutations";
import { cn, formatCurrency } from "~/lib/utils";

const STATUS_CLASS: Record<string, string> = {
  fulfilled: "bg-[#CEF17B]/30 text-[#084734]",
  delivered: "bg-emerald-100 text-emerald-700",
  in_progress: "bg-blue-100 text-blue-700",
  on_hold: "bg-amber-100 text-amber-700",
  partial: "bg-blue-100 text-blue-700",
};

export interface FulfillmentItem {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  price: string | number;
  fulfillmentStatus: string | null;
  imageUrl?: string | null;
}

/**
 * Per-product fulfilment table + actions, shared by the owner order detail and
 * the vendor view. Unfulfilled / on-hold lines can be bulk-selected to Mark
 * fulfilled, Add hold, or Release hold; each fulfilled line gets its own
 * Mark delivered / Unfulfill. Delivered is terminal (no further actions).
 */
export function OrderItemsFulfillment({
  orderId,
  items,
  currency,
  title = "Line items",
  showSubtotal = false,
  allowInProgress = false,
}: {
  orderId: string;
  items: FulfillmentItem[];
  currency: string;
  title?: string;
  showSubtotal?: boolean;
  /** Owner/organization only — surfaces the "Mark in progress" action. */
  allowInProgress?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingCompany, setTrackingCompany] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [holdReason, setHoldReason] = useState("");

  const setStatus = useSetItemsStatusMutation(orderId);
  const createFulfillment = useCreateFulfillmentMutation(orderId);
  const markDelivered = useMarkDeliveredMutation(orderId);
  const unfulfill = useUnfulfillMutation(orderId);
  const updateTracking = useUpdateItemTrackingMutation(orderId);

  // Which line's inline "add tracking" form is open, plus its draft values.
  const [trackingLine, setTrackingLine] = useState<string | null>(null);
  const [tNumber, setTNumber] = useState("");
  const [tCompany, setTCompany] = useState("");

  const selectedIds = [...selected];
  // Only unfulfilled / on-hold lines can be bulk-selected — fulfilled & delivered
  // items have their own per-product actions instead.
  const selectableLines = items.filter(
    (li) => li.fulfillmentStatus !== "fulfilled" && li.fulfillmentStatus !== "delivered",
  );
  const allSelected =
    selectableLines.length > 0 && selectableLines.every((li) => selected.has(li.id));

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleFulfill() {
    if (selectedIds.length === 0) return;
    const hasTracking = trackingNumber || trackingCompany || trackingUrl;
    createFulfillment.mutate(
      {
        lineItems: selectedIds.map((lineItemId) => ({ lineItemId })),
        tracking: hasTracking
          ? {
              number: trackingNumber || undefined,
              company: trackingCompany || undefined,
              url: trackingUrl || undefined,
            }
          : undefined,
      },
      {
        onSuccess: () => {
          setSelected(new Set());
          setTrackingNumber("");
          setTrackingCompany("");
          setTrackingUrl("");
        },
      },
    );
  }

  function handleHold() {
    if (selectedIds.length === 0) return;
    setStatus.mutate(
      { status: "on_hold", lineItemIds: selectedIds, reason: holdReason.trim() || undefined },
      {
        onSuccess: () => {
          setSelected(new Set());
          setHoldReason("");
        },
      },
    );
  }

  function handleRelease() {
    if (selectedIds.length === 0) return;
    setStatus.mutate(
      { status: "released", lineItemIds: selectedIds },
      { onSuccess: () => setSelected(new Set()) },
    );
  }

  function handleInProgress() {
    if (selectedIds.length === 0) return;
    setStatus.mutate(
      { status: "in_progress", lineItemIds: selectedIds },
      { onSuccess: () => setSelected(new Set()) },
    );
  }

  function openTracking(lineId: string) {
    setTrackingLine(lineId);
    setTNumber("");
    setTCompany("");
  }

  function saveTracking(lineId: string) {
    updateTracking.mutate(
      {
        lineId,
        data: { tracking: { number: tNumber || undefined, company: tCompany || undefined } },
      },
      { onSuccess: () => setTrackingLine(null) },
    );
  }

  const subtotal = items.reduce((sum, li) => sum + Number(li.price) * li.quantity, 0);
  const busy = setStatus.isPending || createFulfillment.isPending;

  return (
    <section className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title} ({items.length})
        </h2>
        {selectedIds.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {selectedIds.length} selected
          </span>
        )}
      </div>

      {/* Bulk action toolbar — shown only when items are selected. */}
      {selectedIds.length > 0 && (
        <div className="space-y-2 border-b bg-gray-50 dark:bg-gray-800/40 px-5 py-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Tracking number (optional)"
              className="rounded-lg border bg-white px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#cdff8c] dark:bg-gray-800"
            />
            <input
              value={trackingCompany}
              onChange={(e) => setTrackingCompany(e.target.value)}
              placeholder="Carrier (optional)"
              className="rounded-lg border bg-white px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#cdff8c] dark:bg-gray-800"
            />
            <input
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              placeholder="Tracking URL (optional)"
              className="rounded-lg border bg-white px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#cdff8c] dark:bg-gray-800"
            />
          </div>
          <input
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
            placeholder="Reason for hold (optional)"
            className="w-full rounded-lg border bg-white px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#cdff8c] dark:bg-gray-800"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleFulfill}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#CEF17B] px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-[#BADE6F] disabled:opacity-50"
            >
              {createFulfillment.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              Mark fulfilled
            </button>
            {allowInProgress && (
              <button
                onClick={handleInProgress}
                disabled={busy}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300"
              >
                {setStatus.isPending && setStatus.variables?.status === "in_progress" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Clock className="size-3.5" />
                )}
                Mark in progress
              </button>
            )}
            <button
              onClick={handleHold}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300"
            >
              {setStatus.isPending && setStatus.variables?.status === "on_hold" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <PauseCircle className="size-3.5" />
              )}
              Add hold
            </button>
            <button
              onClick={handleRelease}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-input bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/60"
            >
              {setStatus.isPending && setStatus.variables?.status === "released" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <PlayCircle className="size-3.5" />
              )}
              Release hold
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b">
              <th className="px-5 py-2 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? new Set(selectableLines.map((li) => li.id)) : new Set(),
                    )
                  }
                />
              </th>
              <th className="px-5 py-2 text-left font-medium">Item</th>
              <th className="px-5 py-2 text-right font-medium">Qty</th>
              <th className="px-5 py-2 text-right font-medium">Unit price</th>
              <th className="px-5 py-2 text-right font-medium">Line total</th>
              <th className="px-5 py-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((li) => (
              <Fragment key={li.id}>
                <tr>
                <td className="px-5 py-3 align-top">
                  <input
                    type="checkbox"
                    checked={selected.has(li.id)}
                    disabled={
                      li.fulfillmentStatus === "fulfilled" ||
                      li.fulfillmentStatus === "delivered"
                    }
                    onChange={(e) => toggle(li.id, e.target.checked)}
                    className="disabled:opacity-30"
                  />
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    {li.imageUrl ? (
                      <img
                        src={li.imageUrl}
                        alt=""
                        className="size-9 shrink-0 rounded-md object-cover ring-1 ring-border"
                      />
                    ) : (
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-muted-foreground dark:bg-gray-800">
                        <Package className="size-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{li.title}</p>
                      {li.variantTitle && (
                        <p className="text-[10px] text-muted-foreground">{li.variantTitle}</p>
                      )}
                      {li.sku && (
                        <p className="text-[10px] font-mono text-muted-foreground">SKU {li.sku}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 text-right align-top tabular-nums">{li.quantity}</td>
                <td className="px-5 py-3 text-right align-top tabular-nums">
                  {formatCurrency(li.price, currency)}
                </td>
                <td className="px-5 py-3 text-right align-top font-semibold tabular-nums">
                  {formatCurrency(Number(li.price) * li.quantity, currency)}
                </td>
                <td className="px-5 py-3 text-right align-top">
                  <div className="flex flex-col items-end gap-1.5">
                    {li.fulfillmentStatus ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          STATUS_CLASS[li.fulfillmentStatus] ?? "bg-gray-100 text-gray-600",
                        )}
                      >
                        {li.fulfillmentStatus.replace("_", " ")}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">unfulfilled</span>
                    )}

                    {/* Per-product actions. Delivered is terminal — no actions. */}
                    {li.fulfillmentStatus === "fulfilled" && (
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <button
                          onClick={() => markDelivered.mutate(li.id)}
                          disabled={markDelivered.isPending || unfulfill.isPending}
                          className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
                        >
                          {markDelivered.isPending && markDelivered.variables === li.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Truck className="size-3" />
                          )}
                          Mark delivered
                        </button>
                        <button
                          onClick={() => openTracking(li.id)}
                          title="Add or update tracking"
                          className="inline-flex items-center gap-1 rounded-md border border-input bg-white px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/60"
                        >
                          <MapPin className="size-3" />
                          Add tracking
                        </button>
                        <button
                          onClick={() => unfulfill.mutate(li.id)}
                          disabled={markDelivered.isPending || unfulfill.isPending}
                          title="Switch back to unfulfilled"
                          className="inline-flex items-center gap-1 rounded-md border border-input bg-white px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/60"
                        >
                          {unfulfill.isPending && unfulfill.variables === li.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Undo2 className="size-3" />
                          )}
                          Unfulfill
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>

              {/* Inline "add tracking" form for this product. */}
              {trackingLine === li.id && (
                <tr className="bg-gray-50 dark:bg-gray-800/40">
                  <td />
                  <td colSpan={5} className="px-5 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={tNumber}
                        onChange={(e) => setTNumber(e.target.value)}
                        placeholder="Tracking number"
                        className="min-w-[10rem] flex-1 rounded-lg border bg-white px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#cdff8c] dark:bg-gray-800"
                      />
                      <input
                        value={tCompany}
                        onChange={(e) => setTCompany(e.target.value)}
                        placeholder="Shipping carrier"
                        className="min-w-[8rem] flex-1 rounded-lg border bg-white px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#cdff8c] dark:bg-gray-800"
                      />
                      <button
                        onClick={() => saveTracking(li.id)}
                        disabled={updateTracking.isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
                      >
                        {updateTracking.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <MapPin className="size-3.5" />
                        )}
                        Save
                      </button>
                      <button
                        onClick={() => setTrackingLine(null)}
                        className="rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
            ))}
          </tbody>
          {showSubtotal && (
            <tfoot>
              <tr className="border-t">
                <td colSpan={3} />
                <td className="px-5 py-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                  Subtotal
                </td>
                <td className="px-5 py-3 text-right font-bold tabular-nums">
                  {formatCurrency(subtotal, currency)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
