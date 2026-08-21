import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  Check,
  ChevronRight,
  Loader2,
  Plus,
  Printer,
  Receipt,
  Truck,
  X,
} from "lucide-react";
import { useOrder, useOrders } from "~/hooks/use-order-queries";
import { useCustomer } from "~/hooks/use-customer-queries";
import { useGstins, useIndianStates } from "~/hooks/use-gst-queries";
import { useCurrentOrg, useOrgMembers } from "~/hooks/use-org-queries";
import { useCreateInvoiceMutation } from "~/hooks/use-invoice-mutations";
import { useUpdateOrderMutation } from "~/hooks/use-order-mutations";
import {
  OrderActionsMenu,
  CancelOrderDialog,
  CapturePaymentDialog,
} from "~/components/app/order-actions";
import { OrderFulfillmentsSection, FulfillDialog } from "~/components/app/order-fulfillments";
import { OrderItemsFulfillment } from "~/components/app/order-items-fulfillment";
import { ChannelBadge } from "~/components/app/channel-badge";
import { OrderActivity } from "~/components/app/order-activity";
import { VendorOrderDetail } from "~/components/app/vendor-order-detail";
import { useCurrentRole } from "~/hooks/use-current-role";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatCurrency } from "~/lib/utils";
import {
  FINANCIAL_CLASSES,
  FINANCIAL_LABELS_FULL,
  FULFILLMENT_CLASSES,
  FULFILLMENT_LABELS_FULL,
  isLineFulfilled,
} from "~/lib/order-status";
import { QueryErrorState } from "~/components/app/query-error-state";
import type {
  ChannelPlatform,
  CustomerDetail,
  OrderDetail,
  OrderFulfillment,
  OrderShopifySync,
  OrganizationGstin,
} from "~/types/api";

export function meta() {
  return [{ title: "Order Detail | Collabo CRM" }];
}

/** Placeholder for a field the API does not expose yet. */
const DASH = "—";

/** How many open orders the prev/next rail can see. 100 is the server's `@Max`. */
const OPEN_PAGE_SIZE = 100;

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isVendor } = useCurrentRole();
  const { data: order, isLoading, isError, refetch } = useOrder(id);
  const { data: org } = useCurrentOrg();

  // Every hook must run before the vendor early-return below, or the hook order
  // changes between renders.
  const { data: openOrders } = useOrders({
    fulfillmentStatus: "UNFULFILLED",
    limit: OPEN_PAGE_SIZE,
    page: 1,
  });
  const { data: customer } = useCustomer(order?.customer?.id);
  // Only source of a display name for the order's owner — `OrderTimelineEvent.actorId`
  // and `metadata.createdByUserId` are bare user ids with no Prisma relation to User.
  const { data: orgMembers } = useOrgMembers(org?.id);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [dialog, setDialog] = useState<"fulfill" | "capture" | "cancel" | null>(null);

  const currency = order?.currency ?? org?.currency ?? "INR";
  const gstEnabled = org?.gstEnabled ?? false;

  // The order's live invoice comes embedded in the order response (at most
  // one — enforced server-side). No list-scan: correct at any invoice count,
  // and vendors never trigger a forbidden /invoices request.
  const invoice = order?.invoices?.[0] ?? null;

  // Vendors get a deliberately narrow, vendor-scoped view (their items only).
  if (isVendor) {
    return <VendorOrderDetail orderId={id!} />;
  }

  // Must precede the spinner below: on failure `isLoading` is false and
  // `order` undefined, so `isLoading || !order` held the spinner on screen
  // for ever with no retry and no way out. `!order` keeps a failed background
  // refetch from replacing an order that is already rendered.
  if (isError && !order) {
    return (
      <div className="p-8">
        <QueryErrorState resource="this order" onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading || !order) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const metadata = (order.metadata ?? {}) as Record<string, unknown>;
  const paymentMethod = typeof metadata.paymentMethod === "string" ? metadata.paymentMethod : null;
  const source = typeof metadata.source === "string" ? metadata.source : null;
  const shopifySync = (metadata.shopifySync ?? null) as OrderShopifySync | null;

  // `findOne` returns the raw row, so `createdAt` is the local insert time.
  // The list endpoint shows `externalCreatedAt` — match it or the two pages
  // disagree about when the same order was placed.
  const placedAt = order.externalCreatedAt ?? order.createdAt;

  const fulfilledCount = order.lineItems.filter((li) =>
    isLineFulfilled(li.fulfillmentStatus),
  ).length;
  const outstanding = order.lineItems.filter((li) => !isLineFulfilled(li.fulfillmentStatus));

  // Prefer the fulfilment record; fall back to the tracking the server already
  // flattens onto each line.
  const primaryFulfilment: OrderFulfillment | undefined = order.fulfillments?.[0];
  const trackedLine = order.lineItems.find((li) => li.trackingNumber || li.trackingCompany);
  const carrier = primaryFulfilment?.trackingCompany ?? trackedLine?.trackingCompany ?? null;
  const awb = primaryFulfilment?.trackingNumber ?? trackedLine?.trackingNumber ?? null;

  const subtotal = Number(order.subtotalPrice);
  const tax = Number(order.totalTax);
  const total = Number(order.totalPrice);
  const shipping = Number(order.totalShippingPrice);
  const discounts = Number(order.totalDiscounts);
  // Derived, not stored. Wrong for a mixed-rate cart — the real per-line rate
  // lives on the invoice, which the order payload does not carry.
  const gstRate = subtotal > 0 ? Math.round((tax / subtotal) * 100) : null;

  const balance = deriveBalance(order, total);
  const balanceCaption = balanceCaptionFor(order, balance, currency);

  const orderState = deriveOrderState(order);
  const shippingState = deriveShippingState(order.fulfillments ?? []);

  // A CRM-native order's `externalId` is a synthetic `manual_<uuid>`, not a
  // channel id — only the push-sync blob carries a real Shopify id for those.
  const syncedId = shopifySync?.shopifyOrderId ?? shopifySync?.shopifyOrderName ?? null;
  const nativeId = order.externalId?.startsWith("manual_") ? null : order.externalId ?? null;
  const shopifyOrderRef =
    shopifySync?.status === "FAILED" ? "Sync failed" : (syncedId ?? nativeId ?? DASH);

  const ownerId =
    typeof metadata.createdByUserId === "string"
      ? metadata.createdByUserId
      : (order.timeline.find((e) => e.action === "created")?.actorId ?? null);
  // Join on `member.user.id` — `member.id` is the membership row, not the user.
  const owner = ownerId ? orgMembers?.find((m) => m.user.id === ownerId) : undefined;
  const ownerName = owner
    ? `${owner.user.firstName} ${owner.user.lastName?.charAt(0) ?? ""}.`.trim()
    : null;

  const weightLabel = totalWeightLabel(order.lineItems);

  // Locate this order in the open-order list to drive the prev/next rail. There
  // is no positional endpoint, so we can only see the first page of open orders.
  const openList = openOrders?.data ?? [];
  const openTotal = openOrders?.meta?.total ?? 0;
  const openIndex = openList.findIndex((o) => o.id === order.id);
  const prevId = openIndex > 0 ? openList[openIndex - 1].id : null;
  const nextId =
    openIndex >= 0 && openIndex < openList.length - 1 ? openList[openIndex + 1].id : null;

  // The customer query carries a phone; the order's embedded customer only has
  // one on the detail endpoint. Neither is guaranteed.
  const phone = customer?.phone ?? order.customer?.phone ?? null;

  return (
    <div className="space-y-5">
      {/* Breadcrumb + prev/next rail */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-caption">
          <Link to="/orders" className="text-muted-foreground hover:text-foreground">
            Orders
          </Link>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="font-medium text-foreground">{order.name}</span>
        </nav>
        <div className="flex items-center gap-2">
          {openIndex >= 0 ? (
            <span className="text-caption text-muted-foreground">
              {openIndex + 1} of {openTotal} open
            </span>
          ) : (
            openTotal > 0 && (
              <span className="text-caption text-muted-foreground">{openTotal} open</span>
            )
          )}
          <Button asChild={!!prevId} variant="outline" size="sm" disabled={!prevId}>
            {prevId ? <Link to={`/orders/${prevId}`}>Previous</Link> : <span>Previous</span>}
          </Button>
          <Button asChild={!!nextId} variant="outline" size="sm" disabled={!nextId}>
            {nextId ? <Link to={`/orders/${nextId}`}>Next order</Link> : <span>Next order</span>}
          </Button>
          <OrderActionsMenu order={order} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)_240px]">
        {/* ── Left rail: order meta ─────────────────────────────────────── */}
        <aside className="flex flex-col gap-4.5 rounded-xl bg-card p-4">
          {/* Header */}
          <div className="flex flex-col gap-2">
            <h1 className="text-subhead text-foreground">{order.name}</h1>
            <p className="text-caption text-muted-foreground">
              {new Date(placedAt).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <ChannelBadge
              variant="chip"
              size={13}
              platform={order.channel?.platform as ChannelPlatform | undefined}
              name={order.channel?.name}
            />
          </div>

          {/* Status rows */}
          <div className="flex flex-col gap-2 border-t pt-3">
            <StatusRow label="Order">
              <StatusPill className={orderState.className}>{orderState.label}</StatusPill>
            </StatusRow>
            <StatusRow label="Payment">
              <StatusPill className={FINANCIAL_CLASSES[order.financialStatus]}>
                {FINANCIAL_LABELS_FULL[order.financialStatus]}
              </StatusPill>
            </StatusRow>
            <StatusRow label="Fulfilment">
              <StatusPill className={FULFILLMENT_CLASSES[order.fulfillmentStatus]}>
                {FULFILLMENT_LABELS_FULL[order.fulfillmentStatus]}
              </StatusPill>
            </StatusRow>
            <StatusRow label="Shipping">
              <StatusPill className={shippingState.className}>{shippingState.label}</StatusPill>
            </StatusRow>
            {source === "offline" && (
              <StatusRow label="Source">
                <StatusPill className="bg-info-subtle text-info">In-Store</StatusPill>
              </StatusRow>
            )}
          </div>

          {/* Tags */}
          <RailSection label="Tags">
            <OrderTags order={order} />
          </RailSection>

          {/* Metadata */}
          <RailSection label="Metadata">
            <div className="flex flex-col gap-1.5">
              <MetaRow label="Shopify order" value={shopifyOrderRef} mono />
              <MetaRow label="Invoice" value={invoice?.invoiceNumber ?? DASH} mono />
              {/* No transactions table and no gateway column — a payment
                  reference is not stored anywhere. */}
              <MetaRow label="Payment ref" value={DASH} mono />
              <MetaRow label="Owner" value={ownerName ?? DASH} />
              {/* Nothing order-side links to a Warehouse: StockReservation and
                  PickTask carry orderId + warehouseId but are never written. */}
              <MetaRow label="Warehouse" value={DASH} />
              <MetaRow label="Weight" value={weightLabel ?? DASH} />
              {paymentMethod && <MetaRow label="Payment method" value={paymentMethod} />}
              {order.placeOfSupplyCode && (
                <MetaRow label="Place of supply" value={order.placeOfSupplyCode} />
              )}
            </div>
          </RailSection>

          {/* Order total */}
          <RailSection label="Order total">
            <p className="text-stat tabular-nums text-foreground">
              {formatCurrency(total, currency)}
            </p>
            <p className="text-micro text-muted-foreground">{balanceCaption}</p>
          </RailSection>
        </aside>

        {/* ── Center: line items, fulfilment, activity ───────────────────── */}
        <div className="space-y-5">
          <OrderItemsFulfillment
            orderId={order.id}
            items={order.lineItems}
            currency={currency}
            variant="detail"
            title="Line items"
            allowInProgress
            headerAction={
              <div className="flex items-center gap-3 text-caption font-medium">
                <button
                  onClick={() => setDialog("fulfill")}
                  className="text-brand-strong hover:underline"
                >
                  Edit
                </button>
                {/* No restock endpoint exists — the only restock in the API is a
                    boolean on cancel-order. */}
                <button
                  disabled
                  title="Coming soon — no restock endpoint yet"
                  className="cursor-not-allowed text-muted-foreground opacity-60"
                >
                  Restock
                </button>
              </div>
            }
            footer={
              <div className="flex flex-wrap items-start justify-between gap-4 border-t px-5 py-3 bg-surface-sunken">
                <p className="text-caption text-muted-foreground">
                  Select items to fulfil, hold or refund in bulk
                </p>
                <dl className="w-full max-w-56 space-y-1 text-caption flex flex-col gap-1.5">
                  <TotalRow label="Subtotal" value={formatCurrency(subtotal, currency)} />
                  <TotalRow
                    label={gstRate !== null ? `GST ${gstRate}%` : "GST"}
                    value={formatCurrency(tax, currency)}
                  />
                  {shipping > 0 && (
                    <TotalRow label="Shipping" value={formatCurrency(shipping, currency)} />
                  )}
                  {discounts > 0 && (
                    <TotalRow
                      label="Discounts"
                      value={`-${formatCurrency(discounts, currency)}`}
                      negative
                    />
                  )}
                  <TotalRow label="Total" value={formatCurrency(total, currency)} bold />
                </dl>
              </div>
            }
          />

          {/* Fulfilment summary — carrier, progress, what is still outstanding. */}
          <section className="rounded-xl bg-card shadow-sm ring-1 ring-border">
            <h2 className="border-b px-5 py-3 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
              Fulfilment · {fulfilledCount} shipped, {outstanding.length} outstanding
            </h2>
            <div className="grid grid-cols-1 divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
              <div className="px-5 py-4">
                <p className="text-caption font-medium text-foreground">{carrier ?? DASH}</p>
                <p className="mt-0.5 font-mono text-micro text-muted-foreground">
                  {awb ? `AWB ${awb}` : DASH}
                </p>
                <ShipmentStepper fulfillment={primaryFulfilment} />
              </div>
              <div className="space-y-2 px-5 py-4">
                {outstanding.length > 0 ? (
                  <ul className="space-y-1.5">
                    {outstanding.map((li) => (
                      <li key={li.id} className="flex items-start gap-2 text-caption">
                        <span
                          className={cn(
                            "mt-1.5 size-1.5 shrink-0 rounded-full",
                            li.fulfillmentStatus === "on_hold" ? "bg-muted-foreground" : "bg-warning",
                          )}
                        />
                        <span className="min-w-0 text-foreground">
                          <span className="truncate">{li.title}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            — {li.fulfillmentStatus === "on_hold" ? "on hold" : "ready to ship"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-caption text-muted-foreground">
                    Every item on this order has been fulfilled.
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={outstanding.length === 0}
                  onClick={() => setDialog("fulfill")}
                >
                  <Truck className="size-3.5" />
                  Create fulfilment
                </Button>
              </div>
            </div>
          </section>

          {/* Existing shipments, with edit-tracking / cancel. Self-nulls when empty. */}
          <OrderFulfillmentsSection order={order} />

          {/* Activity — `orgMembers` is already fetched above for the Owner row. */}
          <OrderActivity order={order} currency={currency} members={orgMembers} />

          {/* Refunds */}
          {order.refunds.length > 0 && (
            <section className="rounded-xl bg-card shadow-sm ring-1 ring-border">
              <h2 className="border-b px-5 py-3 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                Refunds ({order.refunds.length})
              </h2>
              <ul className="divide-y">
                {order.refunds.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-caption font-medium tabular-nums text-danger">
                        -{formatCurrency(Number(r.amount), currency)}
                      </p>
                      {r.reason && <p className="text-micro text-muted-foreground">{r.reason}</p>}
                    </div>
                    <p className="text-micro text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString("en-IN")}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ── Right rail: money, actions, customer, note ─────────────────── */}
        <aside className="flex flex-col gap-1.5 rounded-xl bg-card p-4 lg:sticky lg:top-6 lg:self-start">
          {/* The order total lives in the left rail now — this rail opens with
              the actions rather than repeating the same figure. */}
          <div className="space-y-2">
            <Button
              className="w-full bg-brand text-brand-strong hover:bg-brand-hover"
              disabled={outstanding.length === 0}
              onClick={() => setDialog("fulfill")}
            >
              Fulfil items
            </Button>
            <Button variant="brand" className="w-full" onClick={() => setDialog("capture")}>
              Capture payment
            </Button>
            {invoice ? (
              <Button asChild variant="outline" className="w-full">
                <Link to={`/orders/invoices/${invoice.id}/print`} target="_blank">
                  <Receipt className="size-3.5" />
                  View GST invoice
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                disabled={!gstEnabled}
                title={gstEnabled ? undefined : "GST is not enabled for this organization"}
                onClick={() => setShowInvoiceDialog(true)}
              >
                <Receipt className="size-3.5" />
                Generate GST invoice
              </Button>
            )}
            <Button asChild variant="outline" className="w-full">
              <Link to={`/orders/${order.id}/packing-slip`} target="_blank">
                <Printer className="size-3.5" />
                Packing slip
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setDialog("cancel")}
            >
              Cancel order
            </Button>
          </div>

          <CustomerRail order={order} customer={customer} currency={currency} phone={phone} />

          <InternalNote order={order} />
        </aside>
      </div>

      {/* Dialogs — all reused from the actions menu so behaviour stays identical. */}
      {dialog === "fulfill" && <FulfillDialog order={order} onClose={() => setDialog(null)} />}
      {dialog === "capture" && (
        <CapturePaymentDialog order={order} onClose={() => setDialog(null)} />
      )}
      {dialog === "cancel" && <CancelOrderDialog order={order} onClose={() => setDialog(null)} />}
      {showInvoiceDialog && (
        <GenerateInvoiceDialog
          order={order}
          currency={currency}
          onClose={() => setShowInvoiceDialog(false)}
        />
      )}
    </div>
  );
}

/**
 * Outstanding balance.
 *
 * There is no transactions table and no `amountCaptured` column, so the
 * captured figure is only knowable where `financialStatus` makes it
 * unambiguous. `PARTIALLY_PAID` / `PARTIALLY_REFUNDED` return null rather than
 * inventing a number.
 */
function deriveBalance(
  order: OrderDetail,
  total: number,
): { due: number | null; captured: number | null } {
  const refunded = (order.refunds ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  switch (order.financialStatus) {
    case "PAID":
      return { due: 0, captured: total };
    case "REFUNDED":
    case "VOIDED":
      return { due: 0, captured: 0 };
    case "PENDING":
    case "AUTHORIZED":
      return { due: total - refunded, captured: 0 };
    default:
      // PARTIALLY_PAID, PARTIALLY_REFUNDED — genuinely unknowable.
      return { due: null, captured: null };
  }
}

function StatusPill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-micro font-medium",
        className ?? "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/**
 * Order lifecycle pill.
 *
 * There is no state column on `Order` — the whole vocabulary is
 * `financialStatus`, `fulfillmentStatus`, `cancelledAt`, `closedAt`. Note we do
 * NOT derive a "Completed" state from `fulfillmentStatus`: offline orders are
 * created with PAID/FULFILLED defaults, so every manual order would read as
 * finished the instant it was made.
 */
function deriveOrderState(order: OrderDetail): { label: string; className: string } {
  if (order.cancelledAt) return { label: "Cancelled", className: "bg-danger-subtle text-danger" };
  if (order.closedAt) return { label: "Archived", className: "bg-muted text-muted-foreground" };
  return { label: "Processing", className: "bg-muted text-muted-foreground" };
}

/**
 * Shipping pill.
 *
 * `OrderFulfillment.status` is a free-form string that only ever holds
 * `pending` / `fulfilled` / `delivered` / `cancelled`, so this is as granular as
 * the data gets. An order with no fulfilment rows has not shipped at all.
 */
function deriveShippingState(fulfillments: OrderFulfillment[]): {
  label: string;
  className: string;
} {
  const live = fulfillments.filter((f) => f.status !== "cancelled");
  if (live.length === 0) return { label: "Pending", className: "bg-warning-subtle text-warning" };
  if (live.some((f) => f.deliveredAt || f.status === "delivered")) {
    return { label: "Delivered", className: "bg-brand/30 text-brand-strong" };
  }
  if (live.some((f) => f.shippedAt)) {
    return { label: "In transit", className: "bg-info-subtle text-info" };
  }
  return { label: "Packed", className: "bg-muted text-muted-foreground" };
}

/** Grams per unit for the free-form `weightUnit` string. Unknown units are skipped. */
const WEIGHT_TO_KG: Record<string, number> = {
  kg: 1,
  g: 0.001,
  lb: 0.453592,
  oz: 0.0283495,
};

/**
 * Total shipping weight.
 *
 * Line items never snapshot weight, so this reads the live variant. Returns null
 * — rather than "0 kg" — when no line contributes, which is the common case for
 * catalogues that never filled weight in.
 */
function totalWeightLabel(lineItems: OrderDetail["lineItems"]): string | null {
  let kg = 0;
  let counted = 0;
  for (const li of lineItems) {
    const raw = li.variant?.weight;
    if (raw == null) continue;
    const factor = WEIGHT_TO_KG[(li.variant?.weightUnit ?? "kg").toLowerCase()];
    if (!factor) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    kg += value * factor * li.quantity;
    counted += 1;
  }
  if (counted === 0) return null;
  return `${kg.toFixed(kg < 1 ? 3 : 1).replace(/\.0+$/, "")} kg`;
}

function balanceCaptionFor(
  order: OrderDetail,
  balance: { due: number | null; captured: number | null },
  currency: string,
): string {
  switch (order.financialStatus) {
    case "PAID":
      return "Paid in full · nothing outstanding";
    case "REFUNDED":
      return "Refunded in full";
    case "VOIDED":
      return "Voided";
    case "PENDING":
    case "AUTHORIZED":
      return `${formatCurrency(balance.due ?? 0, currency)} outstanding`;
    default:
      // No captured amount is stored anywhere, so any figure here is invented.
      return "Partially paid · balance not tracked";
  }
}

/** A label/pill row in the left rail's status block. */
function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-caption text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** A label/value row in the left rail's metadata block. */
function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-caption text-muted-foreground">{label}</span>
      <span
        className={cn("truncate text-caption text-foreground", mono && "font-mono text-micro")}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/** A titled section in the left rail. */
function RailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 border-t pt-4">
      <p className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/**
 * Tag chips with an inline add field.
 *
 * `PATCH /orders/:id` takes the full tag array — there is no add/remove delta
 * endpoint — so every edit sends the whole list.
 */
function OrderTags({ order }: { order: OrderDetail }) {
  const mutation = useUpdateOrderMutation(order.id);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const tags = order.tags ?? [];

  function commit() {
    const next = draft.trim();
    setDraft("");
    setAdding(false);
    if (!next || tags.includes(next)) return;
    mutation.mutate({ tags: [...tags, next] });
  }

  function remove(tag: string) {
    mutation.mutate({ tags: tags.filter((t) => t !== tag) });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-micro font-medium text-foreground"
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            disabled={mutation.isPending}
            aria-label={`Remove tag ${tag}`}
            className="text-muted-foreground hover:text-danger disabled:opacity-50"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}

      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
          placeholder="Tag name"
          className="h-6 w-24 rounded-full border border-border bg-background px-2 text-micro outline-none focus:ring-1 focus:ring-brand"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={mutation.isPending}
          className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-micro font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <Plus className="size-2.5" />
          Add
        </button>
      )}
    </div>
  );
}

/** A labelled block in the right action rail. */
function RailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 border-t pt-4">
      <p className="text-micro uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function TotalRow({
  label,
  value,
  bold,
  negative,
}: {
  label: string;
  value: string;
  bold?: boolean;
  negative?: boolean;
}) {
  return (
    <div className={cn("flex justify-between gap-4", bold && "border-t pt-1")}>
      <dt className={cn("text-muted-foreground", bold && "font-semibold text-foreground")}>
        {label}
      </dt>
      <dd
        className={cn(
          "tabular-nums text-foreground",
          bold && "font-semibold",
          negative && "text-danger",
        )}
      >
        {value}
      </dd>
    </div>
  );
}


/**
 * Shipment progress.
 *
 * Only two of these four steps are actually backed by data: `OrderFulfillment`
 * carries `createdAt`, `shippedAt` and `deliveredAt`, and its `status` is a
 * free-form string that never takes a "packed" or "in transit" value. The
 * unbacked steps stay grey until carrier-scan ingestion exists.
 */
function ShipmentStepper({ fulfillment }: { fulfillment?: OrderFulfillment }) {
  const steps = useMemo(() => {
    const packed = !!fulfillment;
    const shipped = !!fulfillment?.shippedAt;
    const delivered =
      !!fulfillment?.deliveredAt || fulfillment?.status === "delivered";
    return [
      { label: "Packed", done: packed },
      { label: "Picked up", done: shipped },
      { label: "In transit", done: shipped && !delivered },
      { label: "Delivered", done: delivered },
    ];
  }, [fulfillment]);

  return (
    <ol className="mt-4 flex items-start">
      {steps.map((step, i) => (
        <li key={step.label} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full items-center">
            <span className={cn("h-px flex-1", i === 0 ? "bg-transparent" : "bg-border")} />
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                step.done ? "bg-brand ring-2 ring-brand/30" : "bg-muted",
              )}
            />
            <span
              className={cn(
                "h-px flex-1",
                i === steps.length - 1 ? "bg-transparent" : "bg-border",
              )}
            />
          </div>
          <span
            className={cn(
              "text-micro",
              step.done ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Address bags are untyped `Record<string, unknown>` on the wire — Shopify's
 * snake_case shape for synced orders, `OrderAddressInput` for CRM-native ones.
 * Read the keys defensively and drop anything absent.
 */
function readAddress(address?: Record<string, unknown> | null) {
  const pick = (k: string) =>
    typeof address?.[k] === "string" ? (address[k] as string).trim() : "";
  const street = [pick("address1"), pick("address2")].filter(Boolean).join(", ");
  const region = [
    [pick("city"), pick("zip")].filter(Boolean).join(" "),
    pick("province"),
  ]
    .filter(Boolean)
    .join(", ");
  return {
    lines: [street, region, pick("country")].filter(Boolean),
    phone: pick("phone") || null,
  };
}

/** The fields that actually identify an address — name and phone are not part of it. */
const ADDRESS_KEYS = ["address1", "address2", "city", "province", "zip", "country"] as const;

function sameAddress(
  a?: Record<string, unknown> | null,
  b?: Record<string, unknown> | null,
): boolean {
  if (!a || !b) return false;
  return ADDRESS_KEYS.every((k) => (a[k] ?? "") === (b[k] ?? ""));
}

/**
 * Customer panel in the right rail — identity, contact, lifetime value and the
 * shipping address.
 *
 * `createdAt`, `ordersCount` and `totalSpent` come from the separate
 * `useCustomer` query; the order's own `customer` object carries only
 * id/name/email/phone.
 */
function CustomerRail({
  order,
  customer,
  currency,
  phone,
}: {
  order: OrderDetail;
  customer?: CustomerDetail;
  currency: string;
  phone: string | null;
}) {
  const name = order.customer
    ? `${order.customer.firstName ?? ""} ${order.customer.lastName ?? ""}`.trim()
    : "";

  if (!name) {
    return (
      <RailBlock label="Customer">
        <p className="text-caption italic text-muted-foreground">Guest order</p>
      </RailBlock>
    );
  }

  const since = customer?.createdAt
    ? new Date(customer.createdAt).toLocaleDateString("en-IN", {
      month: "short",
      year: "numeric",
    })
    : null;
  const ship = readAddress(order.shippingAddress);
  const billingMatchesShipping = sameAddress(order.shippingAddress, order.billingAddress);

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      {/* Identity */}
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-caption font-semibold text-brand-strong">
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-foreground">{name}</p>
          <p className="truncate text-micro text-muted-foreground">
            {since ? `Since ${since}` : DASH}
            {customer ? ` · ${customer.ordersCount} orders` : ""}
          </p>
        </div>
      </div>

      {/* Contact */}
      <div className="flex flex-col gap-0.5">
        {order.customer?.email && (
          <a
            href={`mailto:${order.customer.email}`}
            className="truncate text-caption text-info hover:underline"
          >
            {order.customer.email}
          </a>
        )}
        {phone && (
          <a href={`tel:${phone}`} className="truncate text-caption text-info hover:underline">
            {phone}
          </a>
        )}
      </div>

      {/* Lifetime value */}
      <div className="flex items-baseline justify-between gap-2  pt-3">
        <span className="text-caption text-muted-foreground">Lifetime value</span>
        <span className="text-caption font-semibold tabular-nums text-foreground">
          {customer ? formatCurrency(Number(customer.totalSpent), currency) : DASH}
        </span>
      </div>

      {/* No per-customer route exists yet, so this lands on the customers list. */}
      <Link
        to="/orders/customers"
        className=" pt-3 text-center text-caption font-medium text-foreground hover:underline"
      >
        View customer →
      </Link>

      {/* Shipping */}
      <div className="flex flex-col gap-2.5 border-t pt-3">
        <p className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">
          Shipping
        </p>
        {ship.lines.length > 0 ? (
          ship.lines.map((line) => (
            <p key={line} className="text-caption leading-snug text-foreground">
              {line}
            </p>
          ))
        ) : (
          <p className="text-caption text-muted-foreground">{DASH}</p>
        )}
        {ship.phone && <p className="text-caption text-foreground">{ship.phone}</p>}
        {/* Only claimed when the two bags genuinely match — a missing or
            different billing address must not read as "same as shipping". */}
        {billingMatchesShipping && (
          <p className="mt-1 text-micro text-muted-foreground">
            Billing address same as shipping
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Order note.
 *
 * Deliberately NOT labelled "internal" or "visible to staff only": for a
 * Shopify order `update()` pushes `note` straight to Shopify and `upsertOrder`
 * reads it back, so this is the customer-facing order note. A genuinely private
 * field needs its own column — `Customer.internalNotes` is the precedent.
 */
function InternalNote({ order }: { order: OrderDetail }) {
  const mutation = useUpdateOrderMutation(order.id);
  const [note, setNote] = useState(order.note ?? "");
  const dirty = note !== (order.note ?? "");

  return (
    <RailBlock label="Order note">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Add a note to this order"
        className="text-caption"
      />
      <p className="text-micro text-muted-foreground">
        {order.channel?.platform === "SHOPIFY"
          ? "Synced to Shopify — not staff-only."
          : "Stored on the order."}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={!dirty || mutation.isPending}
        onClick={() => mutation.mutate({ note })}
      >
        {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
        Save note
      </Button>
    </RailBlock>
  );
}

// ── Generate Invoice Dialog ─────────────────────────────────────────────────
// Same as the one previously in orders.tsx — mirrors the dialog used by the
// list page so the look and behaviour match.

function GenerateInvoiceDialog({
  order,
  currency,
  onClose,
}: {
  order: OrderDetail;
  currency: string;
  onClose: () => void;
}) {
  const { data: gstins = [] } = useGstins();
  const { data: states = [] } = useIndianStates();
  const createInvoice = useCreateInvoiceMutation();

  const [sellerGstinId, setSellerGstinId] = useState("");
  const [buyerGstin, setBuyerGstin] = useState("");
  const [placeOfSupplyCode, setPlaceOfSupplyCode] = useState("");

  const activeGstins = gstins.filter((g: OrganizationGstin) => g.isActive);

  function handleGenerate() {
    createInvoice.mutate(
      {
        orderId: order.id,
        sellerGstinId: sellerGstinId || undefined,
        buyerGstin: buyerGstin || undefined,
        placeOfSupplyCode: placeOfSupplyCode || undefined,
      },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-body font-bold text-foreground">Generate GST Invoice</h2>
            <p className="text-micro text-muted-foreground">Order {order.name}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          <div>
            <label className="text-micro font-medium text-muted-foreground">
              Seller GSTIN {activeGstins.length === 0 && "(No GSTINs registered)"}
            </label>
            <Select value={sellerGstinId} onValueChange={setSellerGstinId}>
              <SelectTrigger className="mt-1 h-9 text-caption">
                <SelectValue placeholder="Auto-select based on place of supply" />
              </SelectTrigger>
              <SelectContent>
                {activeGstins.map((g: OrganizationGstin) => (
                  <SelectItem key={g.id} value={g.id} className="text-caption">
                    {g.gstin} — {g.stateName} {g.isDefault ? "(Default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-micro font-medium text-muted-foreground">
              Buyer GSTIN (optional — leave empty for B2C)
            </label>
            <input
              value={buyerGstin}
              onChange={(e) => setBuyerGstin(e.target.value.toUpperCase())}
              placeholder="e.g. 29AABCT1332L1ZN"
              maxLength={15}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 font-mono text-caption outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <div>
            <label className="text-micro font-medium text-muted-foreground">Place of Supply</label>
            <Select value={placeOfSupplyCode} onValueChange={setPlaceOfSupplyCode}>
              <SelectTrigger className="mt-1 h-9 text-caption">
                <SelectValue placeholder="Auto-detect from shipping address" />
              </SelectTrigger>
              <SelectContent>
                {states.map((s) => (
                  <SelectItem key={s.code} value={s.code} className="text-caption">
                    {s.code} - {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-surface-sunken p-3 dark:bg-muted/40">
            <p className="mb-1 text-micro uppercase tracking-wider text-muted-foreground">
              Order Summary
            </p>
            <div className="space-y-0.5 text-caption">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span>{order.lineItems.length}</span>
              </div>
              <div className="flex justify-between font-semibold text-foreground">
                <span>Total</span>
                <span className="tabular-nums">
                  {formatCurrency(Number(order.totalPrice), currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t px-6 py-4">
          <button
            onClick={handleGenerate}
            disabled={createInvoice.isPending || activeGstins.length === 0}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-caption font-semibold text-brand-strong hover:bg-brand-hover disabled:opacity-50"
          >
            {createInvoice.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            Generate Invoice
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-caption text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
