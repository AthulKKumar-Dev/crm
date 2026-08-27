import { Fragment, useState, type ReactNode } from "react";
import { CheckCircle2, Clock, Loader2, MapPin, Package, PauseCircle, PlayCircle, Truck, Undo2 } from "lucide-react";
import {
  useSetItemsStatusMutation,
  useCreateFulfillmentMutation,
  useMarkDeliveredMutation,
  useUnfulfillMutation,
  useUpdateItemTrackingMutation,
} from "~/hooks/use-order-mutations";
import { Button } from "~/components/ui/button";
import { CarrierDatalist } from "~/components/app/carrier-datalist";
import { EmptyState } from "~/components/app/empty-state";
import { lineStatusClass, lineStatusLabel } from "~/lib/order-status";
import { cn, formatCurrency } from "~/lib/utils";

/**
 * Carrier entry. Free text with suggestions rather than a closed dropdown —
 * see the note on CARRIER_SUGGESTIONS. This was a one-entry `<select>` that
 * made any non-Shiprocket shipment unrecordable.
 */
function CarrierInput({
  value,
  onChange,
  className,
  listId,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  listId: string;
}) {
  return (
    <>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        placeholder="Shipping carrier"
        className={className}
      />
      <CarrierDatalist id={listId} />
    </>
  );
}

export interface FulfillmentItem {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  price: string | number;
  fulfillmentStatus: string | null;
  imageUrl?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  trackingCompany?: string | null;
}

/**
 * Per-product fulfilment table + actions, shared by the owner order detail and
 * the vendor view. Unfulfilled / on-hold lines can be bulk-selected to Mark
 * fulfilled, Add hold, or Release hold; each fulfilled line gets its own
 * Mark delivered / Unfulfill. Delivered is terminal (no further actions).
 *
 * Two layouts:
 * - `"default"` — Item / Qty / Unit price / Line total / Status. The vendor view.
 * - `"detail"`  — Product / SKU / Status / Qty / Rate / Amount, per-line actions
 *   pushed into a trailing column. The owner order-detail page.
 */
export function OrderItemsFulfillment({
  orderId,
  items,
  currency,
  title = "Line items",
  showSubtotal = false,
  allowInProgress = false,
  variant = "default",
  headerAction,
  footer,
}: {
  orderId: string;
  items: FulfillmentItem[];
  currency: string;
  title?: string;
  showSubtotal?: boolean;
  /** Owner/organization only — surfaces the "Mark in progress" action. */
  allowInProgress?: boolean;
  variant?: "default" | "detail";
  /** Trailing header slot — e.g. the Edit / Restock buttons. */
  headerAction?: ReactNode;
  /** Rendered below the table, inside the card — e.g. the totals block. */
  footer?: ReactNode;
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
  const [tUrl, setTUrl] = useState("");

  const isDetail = variant === "detail";
  const columnCount = isDetail ? 8 : 6;

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

  function openTracking(li: FulfillmentItem) {
    setTrackingLine(li.id);
    setTNumber(li.trackingNumber ?? "");
    setTCompany(li.trackingCompany ?? "");
    setTUrl(li.trackingUrl ?? "");
  }

  function saveTracking(lineId: string) {
    updateTracking.mutate(
      {
        lineId,
        data: {
          tracking: {
            number: tNumber || undefined,
            company: tCompany || undefined,
            url: tUrl || undefined,
          },
        },
      },
      { onSuccess: () => setTrackingLine(null) },
    );
  }

  const subtotal = items.reduce((sum, li) => sum + Number(li.price) * li.quantity, 0);
  // Every mutation this component can fire. It previously listed only the two
  // bulk ones, so the bulk toolbar stayed live while a per-row Mark delivered /
  // Unfulfill / tracking save was still in flight — letting a second write race
  // the first against the same line items.
  const busy =
    setStatus.isPending ||
    createFulfillment.isPending ||
    markDelivered.isPending ||
    unfulfill.isPending ||
    updateTracking.isPending;

  /** Per-line actions. Delivered is terminal — no actions. */
  function lineActions(li: FulfillmentItem) {
    if (li.fulfillmentStatus !== "fulfilled") return null;
    // Tracking used to stay clickable mid-mutation while the other two were
    // disabled, so the dialog could open over an in-flight fulfil/unfulfil.
    const rowBusy = markDelivered.isPending || unfulfill.isPending;
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button
          variant="brand"
          size="xs"
          onClick={() => markDelivered.mutate(li.id)}
          disabled={rowBusy}
          className="text-micro"
        >
          {markDelivered.isPending && markDelivered.variables === li.id ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Truck />
          )}
          Mark delivered
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={() => openTracking(li)}
          disabled={rowBusy}
          title="Add or update tracking"
          className="text-micro text-muted-foreground"
        >
          <MapPin />
          {li.trackingNumber ? "Edit tracking" : "Add tracking"}
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={() => unfulfill.mutate(li.id)}
          disabled={rowBusy}
          title="Switch back to unfulfilled"
          className="text-micro text-muted-foreground"
        >
          {unfulfill.isPending && unfulfill.variables === li.id ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Undo2 />
          )}
          Unfulfill
        </Button>
      </div>
    );
  }

  function statusPill(li: FulfillmentItem) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-micro font-medium",
          lineStatusClass(li.fulfillmentStatus),
        )}
      >
        {lineStatusLabel(li.fulfillmentStatus)}
      </span>
    );
  }

  return (
    <section className="rounded-xl bg-card shadow-sm ring-1 ring-border">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">
          {isDetail ? title : `${title} (${items.length})`}
        </h2>
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <span className="text-micro text-muted-foreground">{selectedIds.length} selected</span>
          )}
          {headerAction}
        </div>
      </div>

      {/* Bulk action toolbar — shown only when items are selected. */}
      {selectedIds.length > 0 && (
        <div className="space-y-2 border-b bg-surface-sunken px-5 py-3 dark:bg-muted/40">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Tracking number (optional)"
              className="rounded-lg border bg-background px-3 py-2 text-caption outline-none focus:ring-1 focus:ring-brand"
            />
            <CarrierInput
              value={trackingCompany}
              onChange={setTrackingCompany}
              listId="carriers-bulk"
              className="rounded-lg border bg-background px-3 py-2 text-caption outline-none focus:ring-1 focus:ring-brand"
            />
            <input
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              placeholder="Tracking URL (optional)"
              className="rounded-lg border bg-background px-3 py-2 text-caption outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <input
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
            placeholder="Reason for hold (optional)"
            className="w-full rounded-lg border bg-background px-3 py-2 text-caption outline-none focus:ring-1 focus:ring-brand"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="accent"
              onClick={handleFulfill}
              disabled={busy}
              className="text-caption font-semibold text-brand-strong"
            >
              {createFulfillment.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              Mark fulfilled
            </Button>
            {allowInProgress && (
              <Button
                variant="ghost"
                onClick={handleInProgress}
                disabled={busy}
                className="bg-info-subtle text-caption text-info hover:bg-info-subtle hover:text-info hover:opacity-80 dark:hover:bg-info-subtle"
              >
                {setStatus.isPending && setStatus.variables?.status === "in_progress" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Clock className="size-3.5" />
                )}
                Mark in progress
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={handleHold}
              disabled={busy}
              className="bg-warning-subtle text-caption text-warning hover:bg-warning-subtle hover:text-warning hover:opacity-80 dark:hover:bg-warning-subtle"
            >
              {setStatus.isPending && setStatus.variables?.status === "on_hold" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <PauseCircle className="size-3.5" />
              )}
              Add hold
            </Button>
            <Button
              variant="outline"
              onClick={handleRelease}
              disabled={busy}
              className="text-caption text-foreground"
            >
              {setStatus.isPending && setStatus.variables?.status === "released" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <PlayCircle className="size-3.5" />
              )}
              Release hold
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        /* Previously this rendered the table anyway, so an order with no lines
           showed a header row above an empty tbody — a ghost table that reads
           as a broken page rather than an empty one. */
        <div className="px-5 py-10">
          <EmptyState
            icon={Package}
            title="No items on this order"
            description="This order has no line items to fulfil."
          />
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-caption">
          <thead className="text-micro uppercase tracking-wider text-muted-foreground">
            <tr className="border-b">
              <th className="w-8 px-5 py-2 text-left">
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
              {isDetail ? (
                <>
                  <th className="px-3 py-2 text-left font-medium">Product</th>
                  <th className="px-3 py-2 text-left font-medium">SKU</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Rate</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-5 py-2" />
                </>
              ) : (
                <>
                  <th className="px-5 py-2 text-left font-medium">Item</th>
                  <th className="px-5 py-2 text-right font-medium">Qty</th>
                  <th className="px-5 py-2 text-right font-medium">Unit price</th>
                  <th className="px-5 py-2 text-right font-medium">Line total</th>
                  <th className="px-5 py-2 text-right font-medium">Status</th>
                </>
              )}
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

                  {isDetail ? (
                    <>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          {li.imageUrl ? (
                            <img
                              src={li.imageUrl}
                              alt=""
                              className="size-8 shrink-0 rounded-md object-cover ring-1 ring-border"
                            />
                          ) : (
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                              <Package className="size-4" />
                            </div>
                          )}
                          <div className="min-w-0 max-w-[11rem]">
                            <p className="truncate font-medium text-foreground">{li.title}</p>
                            {li.variantTitle && (
                              <p className="truncate text-micro text-muted-foreground">
                                {li.variantTitle}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle font-mono text-micro text-muted-foreground">
                        {li.sku ?? "—"}
                      </td>
                      <td className="px-3 py-3 align-middle">{statusPill(li)}</td>
                      <td className="px-3 py-3 text-right align-middle tabular-nums">
                        {li.quantity}
                      </td>
                      <td className="px-3 py-3 text-right align-middle tabular-nums">
                        {formatCurrency(Number(li.price), currency)}
                      </td>
                      <td className="px-3 py-3 text-right align-middle font-semibold tabular-nums">
                        {formatCurrency(Number(li.price) * li.quantity, currency)}
                      </td>
                      <td className="px-5 py-3 align-middle">{lineActions(li)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          {li.imageUrl ? (
                            <img
                              src={li.imageUrl}
                              alt=""
                              className="size-9 shrink-0 rounded-md object-cover ring-1 ring-border"
                            />
                          ) : (
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                              <Package className="size-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{li.title}</p>
                            {li.variantTitle && (
                              <p className="text-micro text-muted-foreground">{li.variantTitle}</p>
                            )}
                            {li.sku && (
                              <p className="font-mono text-micro text-muted-foreground">
                                SKU {li.sku}
                              </p>
                            )}
                            {(li.trackingNumber || li.trackingCompany) && (
                              <p className="text-micro text-muted-foreground">
                                Tracking:{" "}
                                {li.trackingUrl ? (
                                  <a
                                    href={li.trackingUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline"
                                  >
                                    {li.trackingNumber ?? "link"}
                                  </a>
                                ) : (
                                  li.trackingNumber
                                )}
                                {li.trackingCompany ? ` (${li.trackingCompany})` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right align-top tabular-nums">{li.quantity}</td>
                      <td className="px-5 py-3 text-right align-top tabular-nums">
                        {formatCurrency(Number(li.price), currency)}
                      </td>
                      <td className="px-5 py-3 text-right align-top font-semibold tabular-nums">
                        {formatCurrency(Number(li.price) * li.quantity, currency)}
                      </td>
                      <td className="px-5 py-3 text-right align-top">
                        <div className="flex flex-col items-end gap-1.5">
                          {statusPill(li)}
                          {lineActions(li)}
                        </div>
                      </td>
                    </>
                  )}
                </tr>

                {/* Inline "add tracking" form for this product. */}
                {trackingLine === li.id && (
                  <tr className="bg-surface-sunken dark:bg-muted/40">
                    <td />
                    <td colSpan={columnCount - 1} className="px-5 pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={tNumber}
                          onChange={(e) => setTNumber(e.target.value)}
                          placeholder="Tracking number"
                          className="min-w-[10rem] flex-1 rounded-lg border bg-background px-3 py-2 text-caption outline-none focus:ring-1 focus:ring-brand"
                        />
                        <CarrierInput
                          value={tCompany}
                          onChange={setTCompany}
                          listId="carriers-line"
                          className="min-w-[8rem] flex-1 rounded-lg border bg-background px-3 py-2 text-caption outline-none focus:ring-1 focus:ring-brand"
                        />
                        {/* Tracking URL must be present here too: the endpoint
                            is a FULL REPLACE (order.service.ts writes
                            `trackingUrl: dto.tracking.url ?? null`), so a form
                            that omits the field silently erases a stored URL. */}
                        <input
                          value={tUrl}
                          onChange={(e) => setTUrl(e.target.value)}
                          placeholder="Tracking URL"
                          className="min-w-[10rem] flex-1 rounded-lg border bg-background px-3 py-2 text-caption outline-none focus:ring-1 focus:ring-brand"
                        />
                        <Button
                          variant="brand"
                          onClick={() => saveTracking(li.id)}
                          disabled={updateTracking.isPending}
                          className="text-caption"
                        >
                          {updateTracking.isPending ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <MapPin className="size-3.5" />
                          )}
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setTrackingLine(null)}
                          className="text-caption text-muted-foreground"
                        >
                          Cancel
                        </Button>
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
                <td colSpan={columnCount - 3} />
                <td className="px-5 py-3 text-right text-micro uppercase tracking-wider text-muted-foreground">
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
      )}

      {footer}
    </section>
  );
}
