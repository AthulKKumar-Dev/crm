import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Check,
  CircleAlert,
  Loader2,
  Package,
  ChevronRight,
  Printer,
  ScanLine,
  Search,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import {
  useCourierQuotesMutation,
  useCreateShipmentMutation,
} from "~/hooks/use-logistics-mutations";
import {
  useOrdersByIds,
  usePickupLocations,
  useShippableOrders,
} from "~/hooks/use-logistics-queries";
import { useDebounced } from "~/hooks/use-debounced";
import { useNow } from "~/hooks/use-now";
import {
  chargeableWeight,
  formatPromiseDate,
  formatWeight,
  volumetricWeight,
} from "~/lib/logistics-format";
import { PaymentPill } from "~/components/app/logistics/status-pill";
import { SERVICE_TYPE_LABELS } from "~/lib/logistics-status";
import { cn, formatCurrency } from "~/lib/utils";
import type {
  CourierQuote,
  PaymentMode,
  ShipmentPackage,
  ShippableOrder,
} from "~/types/api";

/**
 * Buy a label for one order, in four steps.
 *
 * A modal rather than a page: this is launched from the fulfilment queue while
 * working through it, and a navigation would lose the operator's place in a
 * list they are halfway down. Four steps rather than one form because step 2
 * needs the package from step 1 before it can price anything — the sequence is
 * a real dependency, not ceremony.
 */

const STEPS = ["Parcel", "Rate", "Confirm", "Done"] as const;

const BOX_PRESETS = [
  { id: "bag", name: "Poly bag", dims: "30 × 25 × 6 cm", length: 30, width: 25, height: 6 },
  { id: "small", name: "Small box", dims: "25 × 20 × 10 cm", length: 25, width: 20, height: 10 },
  { id: "medium", name: "Medium box", dims: "33 × 26 × 16 cm", length: 33, width: 26, height: 16 },
];

export function CreateShipmentDialog({
  open,
  orderIds = [],
  onOpenChange,
}: {
  open: boolean;
  /**
   * Orders to ship, in order. Empty opens on a picker instead — that is the
   * path from the "New shipment" button, which has no row context.
   *
   * More than one is worked through a parcel at a time rather than batched: the
   * package, the rate and the courier are per-parcel decisions, and a single
   * form covering five orders would have to assume they are identical.
   */
  orderIds?: string[];
  onOpenChange: (nextOpen: boolean) => void;
}) {
  const now = useNow(60_000);

  const [queue, setQueue] = useState<string[]>(orderIds);
  const [queueIndex, setQueueIndex] = useState(0);

  const orderId = queue[queueIndex] ?? null;
  const isPicking = !orderId;

  const ids = useMemo(() => (orderId ? [orderId] : []), [orderId]);

  const { data: orders, isLoading: ordersLoading } = useOrdersByIds(ids);
  const { data: locations } = usePickupLocations();
  const order = orders?.[0];

  const quoteMutation = useCourierQuotesMutation();
  const createMutation = useCreateShipmentMutation();

  const [step, setStep] = useState(0);
  const [boxId, setBoxId] = useState("small");
  const [weight, setWeight] = useState(0.5);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("PREPAID");
  const [codAmount, setCodAmount] = useState(0);
  const [courierId, setCourierId] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<CourierQuote[] | null>(null);

  const locationId = order?.pickupLocationId ?? locations?.find((l) => l.isDefault)?.id ?? "";
  const box = BOX_PRESETS.find((preset) => preset.id === boxId) ?? BOX_PRESETS[1];

  /** Back to a clean parcel form, keeping the queue. */
  function resetForm() {
    setStep(0);
    setBoxId("small");
    setQuotes(null);
    setCourierId(null);
    createMutation.reset();
    quoteMutation.reset();
  }

  // Seed the queue each time the dialog opens. Without this, opening it a
  // second time from a different row would keep the first row's order.
  useEffect(() => {
    if (!open) return;
    setQueue(orderIds);
    setQueueIndex(0);
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed on open only
  }, [open, orderIds.join(",")]);

  // A new order in the queue means a fresh parcel form.
  useEffect(() => {
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetting on identity change only
  }, [orderId]);

  useEffect(() => {
    if (!order) return;
    setPaymentMode(order.paymentMode);
    setCodAmount(order.paymentMode === "COD" ? order.orderValue : 0);
    // A rough starting weight beats an empty field: 300g a unit is close enough
    // for apparel that most operators only nudge it.
    setWeight(Math.max(0.2, Math.round(order.itemCount * 0.3 * 10) / 10));
  }, [order]);

  const pkg = { ...box, weight };
  const volumetric = volumetricWeight(pkg);
  const chargeable = chargeableWeight(pkg);
  const selectedQuote = quotes?.find((quote) => quote.courierId === courierId) ?? null;

  function loadQuotes() {
    if (!order || !locationId) return;
    quoteMutation.mutate(
      {
        orderIds: [order.id],
        pickupLocationId: locationId,
        packages: [
          { type: box.name, length: box.length, width: box.width, height: box.height, weight, count: 1 },
        ] as Omit<ShipmentPackage, "id">[],
        paymentMode,
        codAmount,
      },
      {
        onSuccess: (result) => {
          setQuotes(result);
          setCourierId(
            (previous) =>
              previous ?? result.find((quote) => quote.recommendationReason)?.courierId ?? null,
          );
        },
      },
    );
  }

  function next() {
    if (step === 0) {
      setStep(1);
      loadQuotes();
      return;
    }
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!order || !locationId || !courierId || !selectedQuote) return;
      createMutation.mutate(
        {
          orderIds: [order.id],
          pickupLocationId: locationId,
          packages: [
            { type: box.name, length: box.length, width: box.width, height: box.height, weight, count: 1 },
          ] as Omit<ShipmentPackage, "id">[],
          paymentMode,
          codAmount: paymentMode === "COD" ? codAmount : undefined,
          courierId,
          serviceType: selectedQuote.serviceType,
          generateAwb: true,
        },
        { onSuccess: () => setStep(3) },
      );
    }
  }

  const created = createMutation.data?.shipments[0];

  const canAdvance =
    step === 0
      ? Boolean(order) && weight > 0
      : step === 1
        ? Boolean(courierId)
        : step === 2
          ? Boolean(courierId) && !createMutation.isPending
          : true;

  const nextLabel =
    step === 0
      ? "Get rates"
      : step === 1
        ? "Continue"
        : step === 2
          ? `Buy label${selectedQuote ? ` · ${formatCurrency(selectedQuote.cost, "INR", { maximumFractionDigits: 0 })}` : ""}`
          : "Done";

  const footerNote =
    step === 0
      ? "Weight and dimensions decide the rate. Under-declaring gets re-weighed at the hub."
      : step === 1
        ? "Rates are live for this lane and this parcel."
        : step === 2
          ? "The label is charged to your wallet when you buy it."
          : "The courier collects on its next scheduled pickup.";

  const hasMoreInQueue = queueIndex < queue.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[88vh] max-w-4xl gap-0 overflow-hidden p-0"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <DialogTitle className="text-section">
              {isPicking ? "Choose an order" : step === 3 ? "Label bought" : "Create shipment"}
            </DialogTitle>
            <p className="mt-0.5 truncate text-caption text-muted-foreground">
              {isPicking
                ? "Pick the order you want to ship."
                : ordersLoading || !order
                  ? "Loading order…"
                  : `${order.orderName} · ${order.customerName} · ${order.destinationCity}, ${order.destinationState}`}
              {queue.length > 1 && !isPicking && (
                <span className="ml-1 text-muted-foreground">
                  · order {queueIndex + 1} of {queue.length}
                </span>
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            className="text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
          </Button>
        </div>

        {isPicking ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <OrderPickerStep
                onPick={(id) => {
                  setQueue([id]);
                  setQueueIndex(0);
                }}
              />
            </div>
            <div className="flex justify-end border-t bg-muted px-5 py-3">
              <Button variant="outline" size="sm" className="bg-card" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
        <>
        {/* Step rail */}
        <ol className="flex items-center border-b px-5 py-3">
          {STEPS.map((label, index) => {
            const isDone = index < step;
            const isCurrent = index === step;

            return (
              <li key={label} className="flex flex-1 items-center gap-2.5">
                <span
                  className={cn(
                    "flex size-5.5 shrink-0 items-center justify-center rounded-full text-micro font-semibold tabular-nums",
                    isDone
                      ? "bg-brand text-brand-foreground"
                      : isCurrent
                        ? "bg-ink text-brand"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {isDone ? <Check className="size-3" strokeWidth={3} /> : index + 1}
                </span>
                <span
                  className={cn(
                    "text-caption",
                    isCurrent ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
                {index < STEPS.length - 1 && (
                  <span className={cn("h-px flex-1", isDone ? "bg-brand" : "bg-border")} />
                )}
              </li>
            );
          })}
        </ol>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === 0 && (
            <ParcelStep
              order={order}
              isLoading={ordersLoading}
              boxId={boxId}
              onBoxChange={setBoxId}
              weight={weight}
              onWeightChange={setWeight}
              volumetric={volumetric}
              chargeable={chargeable}
              paymentMode={paymentMode}
              onPaymentModeChange={setPaymentMode}
              codAmount={codAmount}
              onCodAmountChange={setCodAmount}
            />
          )}

          {step === 1 && (
            <RateStep
              quotes={quotes}
              isLoading={quoteMutation.isPending}
              isError={quoteMutation.isError}
              onRetry={loadQuotes}
              selected={courierId}
              onSelect={setCourierId}
              chargeable={chargeable}
              destination={order ? `${order.destinationPincode}` : ""}
              now={now}
            />
          )}

          {step === 2 && order && (
            <ConfirmStep
              order={order}
              locationName={locations?.find((l) => l.id === locationId)?.name ?? "—"}
              quote={selectedQuote}
              paymentMode={paymentMode}
              codAmount={codAmount}
              error={createMutation.isError ? createMutation.error : null}
              now={now}
            />
          )}

          {step === 3 && created && (
            <DoneStep
              reference={created.reference}
              awb={created.awb}
              courierName={created.courierName}
              cost={created.shippingCost}
              customerName={created.customerName}
              destination={`${created.destinationCity} ${created.destinationPincode}`}
              shipmentId={created.id}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t bg-muted px-5 py-3">
          <span className="hidden text-caption text-muted-foreground sm:block">{footerNote}</span>
          <div className="ml-auto flex gap-2">
            {step > 0 && step < 3 && (
              <Button
                variant="outline"
                size="sm"
                className="bg-card"
                disabled={createMutation.isPending}
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            )}
            {step === 3 ? (
              hasMoreInQueue ? (
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => setQueueIndex((index) => index + 1)}
                >
                  Next order ({queue.length - queueIndex - 1} left)
                </Button>
              ) : (
                <Button variant="brand" size="sm" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              )
            ) : (
              <Button variant="accent" size="sm" disabled={!canAdvance} onClick={next}>
                {createMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
                {nextLabel}
              </Button>
            )}
          </div>
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Step 0 — pick an order ────────────────────────────────────────────── */

/**
 * Shown only when the dialog is opened without a row behind it — the "New
 * shipment" button in a page header. Lists the fulfilment queue, most urgent
 * first, so the common case is picking the top row.
 */
function OrderPickerStep({ onPick }: { onPick: (orderId: string) => void }) {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300);

  const { data, isLoading } = useShippableOrders({
    limit: 20,
    search: debounced || undefined,
    status: "ALL",
  });

  const rows = data?.data ?? [];

  return (
    <div className="space-y-3 p-5">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          autoFocus
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search order, customer, city"
          className="h-9 w-full rounded-lg border border-input bg-transparent pl-8 pr-3 text-caption placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-body text-muted-foreground">
          {debounced
            ? "No orders match that search."
            : "Nothing is waiting to ship. New orders land here as they arrive."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onPick(row.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-ink/30 hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold text-foreground">
                    {row.orderName}
                  </span>
                  <span className="block truncate text-caption text-muted-foreground">
                    {row.customerName} · {row.destinationCity} · {row.itemCount}{" "}
                    {row.itemCount === 1 ? "item" : "items"}
                  </span>
                </span>
                <PaymentPill mode={row.paymentMode} />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Step 1 — parcel ───────────────────────────────────────────────────── */

function ParcelStep({
  order,
  isLoading,
  boxId,
  onBoxChange,
  weight,
  onWeightChange,
  volumetric,
  chargeable,
  paymentMode,
  onPaymentModeChange,
  codAmount,
  onCodAmountChange,
}: {
  order: ShippableOrder | undefined;
  isLoading: boolean;
  boxId: string;
  onBoxChange: (id: string) => void;
  weight: number;
  onWeightChange: (value: number) => void;
  volumetric: number;
  chargeable: number;
  paymentMode: PaymentMode;
  onPaymentModeChange: (mode: PaymentMode) => void;
  codAmount: number;
  onCodAmountChange: (value: number) => void;
}) {
  if (isLoading || !order) {
    return (
      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-2.5">
        <p className="text-label text-foreground">Items in this parcel</p>

        {order.items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
          >
            <span className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-brand text-brand-foreground">
              <Check className="size-2.5" strokeWidth={3} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-medium text-foreground">
                {item.title}
              </span>
              <span className="block truncate font-mono text-micro text-muted-foreground">
                SKU {item.sku}
              </span>
            </span>
            <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
              × {item.quantity}
            </span>
          </div>
        ))}

        <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-caption text-muted-foreground">
          <ScanLine className="size-3.5 shrink-0" />
          Everything in the order goes in one parcel. Split shipments arrive with the backend.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-label text-foreground">Package</p>

        <div className="space-y-1.5">
          {BOX_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onBoxChange(preset.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                boxId === preset.id
                  ? "border-ink ring-1 ring-ink"
                  : "border-border hover:border-ink/30",
              )}
            >
              <span
                className={cn(
                  "size-3 shrink-0 rounded-full border",
                  boxId === preset.id ? "border-ink bg-ink" : "border-input",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-body font-medium text-foreground">{preset.name}</span>
                <span className="block text-micro text-muted-foreground">{preset.dims}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex gap-2.5">
          <div className="flex-1">
            <Label className="mb-1 block text-label">Weight (kg)</Label>
            <Input
              type="number"
              min={0}
              step={0.1}
              value={weight}
              onChange={(event) => onWeightChange(Number(event.target.value))}
              className="h-8 tabular-nums"
            />
          </div>
          <div className="flex-1">
            <Label className="mb-1 block text-label">Payment</Label>
            <div className="flex h-8 rounded-lg border border-input p-0.5">
              {(["PREPAID", "COD"] as PaymentMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onPaymentModeChange(mode)}
                  className={cn(
                    "flex-1 rounded-md text-caption font-medium transition-colors",
                    paymentMode === mode
                      ? "bg-ink text-brand"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode === "PREPAID" ? "Prepaid" : "COD"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {paymentMode === "COD" && (
          <div>
            <Label className="mb-1 block text-label">Collect on delivery</Label>
            <Input
              type="number"
              min={0}
              value={codAmount}
              onChange={(event) => onCodAmountChange(Number(event.target.value))}
              className="h-8 tabular-nums"
            />
          </div>
        )}

        <p
          className={cn(
            "rounded-lg px-3 py-2.5 text-caption",
            volumetric > weight ? "bg-warning-subtle text-warning-strong" : "bg-brand/25 text-brand-strong",
          )}
        >
          Volumetric weight {formatWeight(volumetric)} — you will be billed on{" "}
          {formatWeight(chargeable)}.
        </p>
      </div>
    </div>
  );
}

/* ─── Step 2 — rate ─────────────────────────────────────────────────────── */

function RateStep({
  quotes,
  isLoading,
  isError,
  onRetry,
  selected,
  onSelect,
  chargeable,
  destination,
  now,
}: {
  quotes: CourierQuote[] | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  selected: string | null;
  onSelect: (id: string) => void;
  chargeable: number;
  destination: string;
  now: number;
}) {
  return (
    <div className="space-y-2.5 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-label text-foreground">Available rates</p>
        <p className="text-caption text-muted-foreground">
          {formatWeight(chargeable)} · to {destination}
        </p>
      </div>

      {isError ? (
        <Alert variant="danger">
          <CircleAlert />
          <div className="flex-1">
            <AlertTitle>Could not fetch rates</AlertTitle>
            <AlertDescription>No courier responded for this parcel.</AlertDescription>
            <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : isLoading ? (
        Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
        ))
      ) : (
        quotes?.map((quote) => {
          const isSelected = selected === quote.courierId;
          const disabled = !quote.isServiceable;

          return (
            <button
              key={quote.courierId}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(quote.courierId)}
              className={cn(
                "flex w-full items-center gap-3.5 rounded-xl border px-4 py-3 text-left transition-colors",
                disabled
                  ? "border-border opacity-55"
                  : isSelected
                    ? "border-ink ring-1 ring-ink"
                    : "border-border hover:border-ink/30",
              )}
            >
              <span
                className={cn(
                  "size-3.5 shrink-0 rounded-full border",
                  isSelected ? "border-ink bg-ink" : "border-input",
                )}
              />
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-micro font-semibold text-muted-foreground">
                {quote.initials}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-body font-semibold text-foreground">
                    {quote.courierName} {SERVICE_TYPE_LABELS[quote.serviceType]}
                  </span>
                  {quote.recommendationReason && (
                    <span className="rounded-full bg-brand px-2 py-0.5 text-micro font-semibold text-brand-foreground">
                      Recommended
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-caption text-muted-foreground">
                  {disabled
                    ? quote.unavailableReason
                    : `${quote.supportsCod ? "COD available" : "Prepaid only"} · ${quote.rtoRate.toFixed(1)}% RTO`}
                </span>
              </span>

              {!disabled && (
                <>
                  <span className="hidden shrink-0 text-right sm:block">
                    <span className="block text-micro text-muted-foreground">
                      {quote.deliveryRate.toFixed(0)}% on-time
                    </span>
                    <span className="block text-caption text-foreground">
                      {formatPromiseDate(quote.estimatedDeliveryAt, now)}
                    </span>
                  </span>
                  <span className="w-20 shrink-0 text-right text-section tabular-nums text-foreground">
                    {formatCurrency(quote.cost, "INR", { maximumFractionDigits: 0 })}
                  </span>
                </>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}

/* ─── Step 3 — confirm ──────────────────────────────────────────────────── */

function ConfirmStep({
  order,
  locationName,
  quote,
  paymentMode,
  codAmount,
  error,
  now,
}: {
  order: ShippableOrder;
  locationName: string;
  quote: CourierQuote | null;
  paymentMode: PaymentMode;
  codAmount: number;
  error: unknown;
  now: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-4">
        {error != null && (
          <Alert variant="danger">
            <CircleAlert />
            <div>
              <AlertTitle>The courier rejected this booking</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : "Try a different courier."}
              </AlertDescription>
            </div>
          </Alert>
        )}

        <div>
          <p className="mb-2 text-label text-foreground">Ship to</p>
          <div className="rounded-xl border border-border px-4 py-3 text-body leading-relaxed text-foreground">
            {order.customerName}
            <br />
            {order.destinationCity}, {order.destinationState} {order.destinationPincode}
            <br />
            <span className="text-caption text-muted-foreground">{order.customerPhone}</span>
          </div>
        </div>

        <div>
          <p className="mb-2 text-label text-foreground">Pickup</p>
          <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-foreground">{locationName}</p>
              <p className="text-caption text-muted-foreground">
                {quote ? `Collected ${formatPromiseDate(quote.estimatedPickupAt, now)}` : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="self-start rounded-xl bg-muted p-4">
        <p className="text-label text-foreground">Label charges</p>

        <dl className="mt-3 space-y-2">
          {quote?.breakdown.map((line) => (
            <div key={line.label} className="flex justify-between gap-3">
              <dt className="text-caption text-muted-foreground">{line.label}</dt>
              <dd className="text-caption tabular-nums text-foreground">
                {formatCurrency(line.amount, "INR", { maximumFractionDigits: 0 })}
              </dd>
            </div>
          ))}
          {paymentMode === "COD" && (
            <div className="flex justify-between gap-3">
              <dt className="text-caption text-muted-foreground">Collect on delivery</dt>
              <dd className="text-caption tabular-nums text-foreground">
                {formatCurrency(codAmount, "INR", { maximumFractionDigits: 0 })}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-3 flex justify-between border-t pt-3">
          <span className="text-body font-semibold text-foreground">Total</span>
          <span className="text-section tabular-nums text-foreground">
            {quote ? formatCurrency(quote.cost, "INR", { maximumFractionDigits: 0 }) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 4 — done ─────────────────────────────────────────────────────── */

/**
 * A drawn label preview rather than a real one.
 *
 * The barcode is decorative bars, not a scannable Code 128 — there is no
 * courier behind this and printing a barcode that scans to nothing would be
 * worse than obviously showing a placeholder.
 */
function DoneStep({
  reference,
  awb,
  courierName,
  cost,
  customerName,
  destination,
  shipmentId,
}: {
  reference: string;
  awb: string | null;
  courierName: string | null;
  cost: number;
  customerName: string;
  destination: string;
  shipmentId: string;
}) {
  const bars = useMemo(
    () =>
      Array.from({ length: 34 }, (_, index) => ({
        // Deterministic widths — a random barcode would reshuffle on re-render.
        width: (index * 7) % 3 === 0 ? 3 : (index * 5) % 4 === 0 ? 2 : 1,
        filled: (index * 3) % 4 !== 0,
      })),
    [],
  );

  return (
    <div className="flex flex-col items-center gap-4 px-5 py-7">
      <span className="flex size-11 items-center justify-center rounded-full bg-brand/40 text-brand-strong">
        <Check className="size-5" strokeWidth={2.5} />
      </span>

      <div className="text-center">
        <p className="text-section text-foreground">
          Label bought — <span className="font-mono">{awb ?? reference}</span>
        </p>
        <p className="mt-1 text-caption text-muted-foreground">
          {courierName} · {formatCurrency(cost, "INR", { maximumFractionDigits: 0 })} charged
        </p>
      </div>

      <div className="w-72 space-y-2.5 rounded-xl border border-border p-4">
        <div className="flex justify-between text-micro uppercase tracking-wider text-muted-foreground">
          <span>{courierName}</span>
          <span>Prepaid</span>
        </div>
        <p className="text-body font-semibold leading-snug text-foreground">
          {customerName}
          <br />
          <span className="font-normal text-muted-foreground">{destination}</span>
        </p>

        <div aria-hidden className="flex h-11 items-stretch gap-0.5">
          {bars.map((bar, index) => (
            <span
              key={index}
              className={cn("shrink-0", bar.filled ? "bg-foreground" : "bg-transparent")}
              // Computed geometry — the sanctioned use of an inline style.
              style={{ width: `${bar.width}px` }}
            />
          ))}
        </div>

        <p className="text-center font-mono text-caption tracking-widest text-foreground">
          {awb ?? "—"}
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm">
          <Printer className="size-3.5" />
          Print packing slip
        </Button>
        <Button asChild variant="accent" size="sm">
          <Link to={`/logistics/shipments/${shipmentId}`}>
            <Package className="size-3.5" />
            View shipment
          </Link>
        </Button>
      </div>
    </div>
  );
}
