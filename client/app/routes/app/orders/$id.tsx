import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Loader2,
  Receipt,
  ExternalLink,
  Check,
  AlertTriangle,
  Clock,
  Package,
  CreditCard,
  Printer,
  X,
} from "lucide-react";
import { useOrder } from "~/hooks/use-order-queries";
import { useGstins, useIndianStates } from "~/hooks/use-gst-queries";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { useCreateInvoiceMutation } from "~/hooks/use-invoice-mutations";
import { OrderActionsMenu } from "~/components/app/order-actions";
import { OrderFulfillmentsSection } from "~/components/app/order-fulfillments";
import { OrderItemsFulfillment } from "~/components/app/order-items-fulfillment";
import { VendorOrderDetail } from "~/components/app/vendor-order-detail";
import { useCurrentRole } from "~/hooks/use-current-role";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn, formatCurrency } from "~/lib/utils";
import { QueryErrorState } from "~/components/app/query-error-state";
import type {
  OrderDetail,
  OrganizationGstin,
} from "~/types/api";

export function meta() {
  return [{ title: "Order Detail | Collabo CRM" }];
}

const FINANCIAL_CLASS: Record<string, string> = {
  PAID: "bg-[#CEF17B]/30 text-[#084734]",
  PARTIALLY_PAID: "bg-blue-100 text-blue-700",
  PENDING: "bg-orange-100 text-orange-600",
  AUTHORIZED: "bg-blue-100 text-blue-700",
  PARTIALLY_REFUNDED: "bg-yellow-100 text-yellow-700",
  REFUNDED: "bg-gray-100 text-gray-600",
  VOIDED: "bg-red-100 text-red-600",
};

const FULFILLMENT_CLASS: Record<string, string> = {
  FULFILLED: "bg-[#CEF17B]/30 text-[#084734]",
  PARTIAL: "bg-blue-100 text-blue-700",
  UNFULFILLED: "bg-orange-100 text-orange-600",
  RESTOCKED: "bg-gray-100 text-gray-600",
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isVendor } = useCurrentRole();
  const { data: order, isLoading, isError, refetch } = useOrder(id);
  const { data: org } = useCurrentOrg();
  const currency = order?.currency ?? org?.currency ?? "INR";
  const gstEnabled = org?.gstEnabled ?? false;

  // The order's live invoice comes embedded in the order response (at most
  // one — enforced server-side). No list-scan: correct at any invoice count,
  // and vendors never trigger a forbidden /invoices request.
  const invoice = order?.invoices?.[0] ?? null;

  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);

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

  const meta = (order.metadata ?? {}) as Record<string, unknown>;
  const paymentMethod = typeof meta.paymentMethod === "string" ? meta.paymentMethod : null;
  const source = typeof meta.source === "string" ? meta.source : null;
  const shopifySync = (meta.shopifySync ?? null) as
    | { status: "PENDING" | "SYNCED" | "FAILED"; shopifyOrderId?: string; shopifyOrderName?: string; error?: string }
    | null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/orders"
            className="mb-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100"
          >
            <ArrowLeft className="size-3.5" />
            Back to orders
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Order {order.name}
            </h1>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                FINANCIAL_CLASS[order.financialStatus] ?? "bg-gray-100 text-gray-600",
              )}
            >
              {order.financialStatus}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                FULFILLMENT_CLASS[order.fulfillmentStatus] ?? "bg-gray-100 text-gray-600",
              )}
            >
              {order.fulfillmentStatus}
            </span>
            {source === "offline" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                In-Store
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(order.createdAt).toLocaleString("en-IN", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {paymentMethod && ` • Paid via ${paymentMethod}`}
            {order.channel && ` • ${order.channel.name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/orders/${order.id}/packing-slip`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/60"
          >
            <Printer className="size-3.5" /> Packing slip
          </Link>
          <Link
            to={`/orders/${order.id}/pick-slip`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/60"
          >
            <Printer className="size-3.5" /> Pick slip
          </Link>
          {gstEnabled && !invoice && (
            <button
              onClick={() => setShowInvoiceDialog(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#CEF17B] px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-[#BADE6F]"
            >
              <Receipt className="size-3.5" />
              Generate GST Invoice
            </button>
          )}
          <OrderActionsMenu order={order} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Customer card */}
          <Section title="Customer">
            {order.customer ? (
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {(order.customer.firstName ?? "") + " " + (order.customer.lastName ?? "")}
                </p>
                {order.customer.email && (
                  <p className="text-xs text-muted-foreground">{order.customer.email}</p>
                )}
                {(order.customer as any).phone && (
                  <p className="text-xs text-muted-foreground">{(order.customer as any).phone}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Guest order</p>
            )}
          </Section>

          {/* Line items — with per-product fulfilment actions (fulfill, mark
              delivered, unfulfill, hold/release). */}
          <OrderItemsFulfillment
            orderId={order.id}
            items={order.lineItems}
            currency={currency}
            title="Line items"
            allowInProgress
          />

          {/* Totals */}
          <Section title="Totals">
            <div className="space-y-1 text-xs">
              <Row label="Subtotal" value={formatCurrency(order.subtotalPrice, currency)} />
              <Row label="Tax" value={formatCurrency(order.totalTax, currency)} />
              {Number(order.totalShippingPrice) > 0 && (
                <Row label="Shipping" value={formatCurrency(order.totalShippingPrice, currency)} />
              )}
              {Number(order.totalDiscounts) > 0 && (
                <Row
                  label="Discounts"
                  value={`-${formatCurrency(order.totalDiscounts, currency)}`}
                  highlight="negative"
                />
              )}
              <div className="mt-2 border-t pt-2">
                <Row
                  label="Grand total"
                  value={formatCurrency(order.totalPrice, currency)}
                  highlight="bold"
                />
              </div>
            </div>
          </Section>

          {/* Fulfillments */}
          <OrderFulfillmentsSection order={order} />

          {/* Timeline */}
          {order.timeline.length > 0 && (
            <Section title="Timeline">
              <ul className="space-y-3">
                {order.timeline.map((evt) => (
                  <li key={evt.id} className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-6 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-muted-foreground">
                      <Clock className="size-3" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-900 dark:text-gray-100">{evt.message}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(evt.createdAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Refunds */}
          {order.refunds.length > 0 && (
            <Section title={`Refunds (${order.refunds.length})`}>
              <ul className="space-y-2">
                {order.refunds.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border bg-gray-50 dark:bg-gray-800/50 px-3 py-2"
                  >
                    <div>
                      <p className="text-xs font-medium tabular-nums">
                        -{formatCurrency(r.amount, currency)}
                      </p>
                      {r.reason && <p className="text-[10px] text-muted-foreground">{r.reason}</p>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString("en-IN")}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="space-y-6">
          {/* Payment / order info */}
          <Section title="Payment">
            <dl className="space-y-1.5 text-xs">
              <DescRow label="Currency" value={order.currency} />
              {paymentMethod && <DescRow label="Method" value={paymentMethod} icon={<CreditCard className="size-3" />} />}
              <DescRow label="Items" value={String(order.itemCount ?? order.lineItems.length)} icon={<Package className="size-3" />} />
            </dl>
          </Section>

          {/* Linked invoice */}
          {invoice ? (
            <Section title="GST Invoice">
              <div className="space-y-2 text-xs">
                <p className="font-mono font-semibold">{invoice.invoiceNumber}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Total: <span className="tabular-nums font-medium">{formatCurrency(invoice.grandTotal, currency)}</span>
                </p>
                <Link
                  to={`/invoices/${invoice.id}/print`}
                  target="_blank"
                  className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 px-3 py-2 text-[11px] font-medium text-white dark:text-gray-900 hover:opacity-90"
                >
                  <Receipt className="size-3.5" />
                  View / print bill
                </Link>
              </div>
            </Section>
          ) : (
            gstEnabled && (
              <Section title="GST Invoice">
                <p className="text-xs text-muted-foreground">No invoice generated yet.</p>
                <button
                  onClick={() => setShowInvoiceDialog(true)}
                  className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#CEF17B] px-3 py-2 text-[11px] font-medium text-gray-900 hover:bg-[#BADE6F]"
                >
                  <Receipt className="size-3.5" />
                  Generate invoice
                </button>
              </Section>
            )
          )}

          {/* Shopify sync card */}
          {shopifySync && (
            <Section title="Shopify Sync">
              <ShopifySyncCard sync={shopifySync} />
            </Section>
          )}

          {/* Channel */}
          {order.channel && (
            <Section title="Channel">
              <p className="text-xs text-gray-900 dark:text-gray-100">{order.channel.name}</p>
              <p className="text-[10px] text-muted-foreground">{order.channel.platform}</p>
            </Section>
          )}
        </div>
      </div>

      {/* Generate invoice dialog */}
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

function ShopifySyncCard({
  sync,
}: {
  sync: { status: "PENDING" | "SYNCED" | "FAILED"; shopifyOrderId?: string; shopifyOrderName?: string; error?: string };
}) {
  if (sync.status === "SYNCED") {
    return (
      <div className="space-y-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-900/30 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-300">
          <Check className="size-3" />
          Synced
        </span>
        {sync.shopifyOrderName && (
          <p className="text-[10px] text-muted-foreground">
            Shopify order: <span className="font-mono">{sync.shopifyOrderName}</span>
          </p>
        )}
        {sync.shopifyOrderId && (
          <p className="text-[10px] text-muted-foreground">
            ID: <span className="font-mono">{sync.shopifyOrderId}</span>
          </p>
        )}
      </div>
    );
  }
  if (sync.status === "PENDING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
        <Loader2 className="size-3 animate-spin" />
        Syncing
      </span>
    );
  }
  return (
    <div className="space-y-2 text-xs">
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/30 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300">
        <AlertTriangle className="size-3" />
        Sync failed
      </span>
      {sync.error && <p className="text-[10px] text-red-700 dark:text-red-400">{sync.error}</p>}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
      <h2 className="border-b px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "bold" | "negative";
}) {
  return (
    <div className="flex justify-between">
      <span
        className={cn(
          "text-muted-foreground",
          highlight === "bold" && "font-semibold text-gray-900 dark:text-gray-100",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          highlight === "bold" && "font-semibold",
          highlight === "negative" && "text-red-600",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function DescRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="font-medium text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Generate GST Invoice</h2>
            <p className="text-[10px] text-muted-foreground">Order {order.name}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          <div>
            <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
              Seller GSTIN {activeGstins.length === 0 && "(No GSTINs registered)"}
            </label>
            <Select value={sellerGstinId} onValueChange={setSellerGstinId}>
              <SelectTrigger className="mt-1 h-9 text-xs">
                <SelectValue placeholder="Auto-select based on place of supply" />
              </SelectTrigger>
              <SelectContent>
                {activeGstins.map((g: OrganizationGstin) => (
                  <SelectItem key={g.id} value={g.id} className="text-xs">
                    {g.gstin} — {g.stateName} {g.isDefault ? "(Default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
              Buyer GSTIN (optional — leave empty for B2C)
            </label>
            <input
              value={buyerGstin}
              onChange={(e) => setBuyerGstin(e.target.value.toUpperCase())}
              placeholder="e.g. 29AABCT1332L1ZN"
              maxLength={15}
              className="mt-1 w-full rounded-lg border bg-white dark:bg-gray-800 px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-[#cdff8c]"
            />
          </div>

          <div>
            <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
              Place of Supply
            </label>
            <Select value={placeOfSupplyCode} onValueChange={setPlaceOfSupplyCode}>
              <SelectTrigger className="mt-1 h-9 text-xs">
                <SelectValue placeholder="Auto-detect from shipping address" />
              </SelectTrigger>
              <SelectContent>
                {states.map((s) => (
                  <SelectItem key={s.code} value={s.code} className="text-xs">
                    {s.code} - {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-gray-50 dark:bg-gray-800 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Order Summary</p>
            <div className="text-xs space-y-0.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span>{order.lineItems.length}</span>
              </div>
              <div className="flex justify-between font-semibold text-gray-900 dark:text-gray-100">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(order.totalPrice, currency)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t px-6 py-4">
          <button
            onClick={handleGenerate}
            disabled={createInvoice.isPending || activeGstins.length === 0}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#cdff8c] px-4 py-2 text-xs font-semibold text-gray-900 hover:bg-[#b8e67d] disabled:opacity-50"
          >
            {createInvoice.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            Generate Invoice
          </button>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-xs text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
