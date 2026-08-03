import { useState } from "react";
import {
  ChevronDown,
  CheckCircle2,
  XCircle,
  Archive,
  RotateCcw,
  CreditCard,
  Pencil,
  Truck,
  UploadCloud,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  useUpdateOrderMutation,
  useCancelOrderMutation,
  useCloseOrderMutation,
  useOpenOrderMutation,
  useMarkOrderPaidMutation,
  useCaptureOrderPaymentMutation,
  useSyncOrderMutation,
} from "~/hooks/use-order-mutations";
import { formatCurrency } from "~/lib/utils";
import { useCurrentRole } from "~/hooks/use-current-role";
import type { OrderDetail, OrderCancelReason } from "~/types/api";
import {
  ModalShell,
  DialogFooter,
  CheckboxRow,
} from "~/components/app/order-dialog-primitives";
import { FulfillDialog } from "~/components/app/order-fulfillments";

type DialogKind =
  | "edit"
  | "cancel"
  | "capture"
  | "markPaid"
  | "close"
  | "open"
  | "fulfill"
  | null;

/**
 * Actions menu shown next to the order header. Renders a dropdown of
 * lifecycle/metadata actions and the matching dialog when one is selected.
 *
 * Each action is gated by the order's current state so the merchant never
 * sees an option that the server would reject (cancel is hidden on an
 * already-cancelled order, etc.). Capture is Shopify-only because manual
 * orders don't have an authorize/capture cycle.
 */
export function OrderActionsMenu({ order }: { order: OrderDetail }) {
  const [dialog, setDialog] = useState<DialogKind>(null);

  // All mutation hooks must be called unconditionally at the top of the
  // component (Rules of Hooks). Previously these were inlined into the
  // conditional `dialog === ...` blocks, which crashed React with
  // "Rendered more hooks than during the previous render" the first time
  // any action was opened.
  const markPaidMutation = useMarkOrderPaidMutation(order.id);
  const closeMutation = useCloseOrderMutation(order.id);
  const openMutation = useOpenOrderMutation(order.id);
  const syncMutation = useSyncOrderMutation(order.id);

  // Financial actions (cancel / capture / mark-paid) are manager-only on the
  // server. Mirror that here so a VIEWER or AGENT isn't shown buttons that can
  // only answer 403 — the server remains the actual boundary.
  const { role } = useCurrentRole();
  const canManage =
    role === "OWNER" || role === "ADMIN" || role === "MANAGER";

  const isShopify = order.channel.platform === "SHOPIFY";
  const isManual = order.channel.platform === "MANUAL";
  const isCancelled = !!order.cancelledAt;
  const isClosed = !!order.closedAt;
  const canMarkPaid =
    canManage &&
    order.financialStatus !== "PAID" &&
    order.financialStatus !== "REFUNDED" &&
    order.financialStatus !== "VOIDED";
  const canCapture =
    canManage &&
    isShopify &&
    (order.financialStatus === "AUTHORIZED" ||
      order.financialStatus === "PARTIALLY_PAID");
  const canFulfill =
    !isCancelled &&
    order.fulfillmentStatus !== "FULFILLED" &&
    order.fulfillmentStatus !== "RESTOCKED";

  // Manual sync to Shopify: only meaningful for MANUAL orders that haven't
  // been pushed yet (or where the previous push failed).
  const syncMeta = (order.metadata as { shopifySync?: { status?: string } } | undefined)
    ?.shopifySync;
  const canSyncToShopify =
    isManual && (!syncMeta || syncMeta.status === "FAILED");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center gap-1.5 rounded-lg border bg-white dark:bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
            Actions
            <ChevronDown className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil className="size-3.5" />
            Edit details
          </DropdownMenuItem>

          {canSyncToShopify && (
            <DropdownMenuItem
              disabled={syncMutation.isPending}
              onSelect={() => syncMutation.mutate()}
            >
              <UploadCloud className="size-3.5" />
              Sync to Shopify
            </DropdownMenuItem>
          )}

          {canFulfill && (
            <DropdownMenuItem onSelect={() => setDialog("fulfill")}>
              <Truck className="size-3.5" />
              Fulfill items
            </DropdownMenuItem>
          )}

          {canMarkPaid && (
            <DropdownMenuItem onSelect={() => setDialog("markPaid")}>
              <CheckCircle2 className="size-3.5" />
              Mark as paid
            </DropdownMenuItem>
          )}

          {canCapture && (
            <DropdownMenuItem onSelect={() => setDialog("capture")}>
              <CreditCard className="size-3.5" />
              Capture payment
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {!isClosed && !isCancelled && (
            <DropdownMenuItem onSelect={() => setDialog("close")}>
              <Archive className="size-3.5" />
              Archive order
            </DropdownMenuItem>
          )}

          {isClosed && !isCancelled && (
            <DropdownMenuItem onSelect={() => setDialog("open")}>
              <RotateCcw className="size-3.5" />
              Re-open order
            </DropdownMenuItem>
          )}

          {canManage && !isCancelled && (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDialog("cancel")}
            >
              <XCircle className="size-3.5" />
              Cancel order
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "edit" && (
        <EditOrderDialog order={order} onClose={() => setDialog(null)} />
      )}
      {dialog === "cancel" && (
        <CancelOrderDialog order={order} onClose={() => setDialog(null)} />
      )}
      {dialog === "capture" && (
        <CapturePaymentDialog order={order} onClose={() => setDialog(null)} />
      )}
      {dialog === "markPaid" && (
        <ConfirmActionDialog
          title="Mark as paid?"
          body={`Order ${order.name} will be marked as paid${
            isShopify ? " in Shopify and locally" : ""
          }.`}
          confirmLabel="Mark paid"
          mutation={markPaidMutation}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "close" && (
        <ConfirmActionDialog
          title="Archive this order?"
          body={`Order ${order.name} will be archived${
            isShopify ? " in Shopify and locally" : ""
          }. You can re-open it any time.`}
          confirmLabel="Archive"
          mutation={closeMutation}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "open" && (
        <ConfirmActionDialog
          title="Re-open this order?"
          body={`Order ${order.name} will be moved out of the archive.`}
          confirmLabel="Re-open"
          mutation={openMutation}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "fulfill" && (
        <FulfillDialog order={order} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

// ─── Edit Order Dialog ──────────────────────────────────────────────────────
// Lightweight edit: tags (comma-separated) + note. Address / contact / custom
// attributes are accepted by the API but stay out of this dialog for now.

function EditOrderDialog({
  order,
  onClose,
}: {
  order: OrderDetail;
  onClose: () => void;
}) {
  const mutation = useUpdateOrderMutation(order.id);
  const [tagsText, setTagsText] = useState((order.tags ?? []).join(", "));
  const [note, setNote] = useState(order.note ?? "");

  function handleSubmit() {
    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    mutation.mutate(
      { tags, note: note || undefined },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <ModalShell title="Edit order" subtitle={`Order ${order.name}`} onClose={onClose}>
      <div className="space-y-4 px-6 py-4">
        <div>
          <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
            Tags (comma-separated)
          </label>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="e.g. vip, retry, wholesale"
            className="mt-1 w-full rounded-lg border bg-white dark:bg-gray-800 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#cdff8c]"
          />
        </div>

        <div>
          <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
            Internal note
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Visible to staff only"
            className="mt-1 w-full rounded-lg border bg-white dark:bg-gray-800 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#cdff8c]"
          />
        </div>
      </div>

      <DialogFooter
        confirmLabel="Save changes"
        onConfirm={handleSubmit}
        onClose={onClose}
        pending={mutation.isPending}
      />
    </ModalShell>
  );
}

// ─── Cancel Order Dialog ────────────────────────────────────────────────────

const CANCEL_REASONS: { value: OrderCancelReason; label: string }[] = [
  { value: "CUSTOMER", label: "Customer changed/cancelled their mind" },
  { value: "FRAUD", label: "Suspected fraud" },
  { value: "INVENTORY", label: "Items out of stock" },
  { value: "DECLINED", label: "Payment declined" },
  { value: "OTHER", label: "Other" },
];

function CancelOrderDialog({
  order,
  onClose,
}: {
  order: OrderDetail;
  onClose: () => void;
}) {
  const mutation = useCancelOrderMutation(order.id);
  const isShopify = order.channel.platform === "SHOPIFY";

  const [reason, setReason] = useState<OrderCancelReason>("CUSTOMER");
  const [refund, setRefund] = useState(false);
  const [restock, setRestock] = useState(true);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [staffNote, setStaffNote] = useState("");

  function handleSubmit() {
    mutation.mutate(
      {
        reason,
        refund,
        restock,
        notifyCustomer,
        staffNote: staffNote || undefined,
      },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <ModalShell title="Cancel order" subtitle={`Order ${order.name}`} onClose={onClose}>
      <div className="space-y-4 px-6 py-4">
        <div>
          <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
            Reason
          </label>
          <Select value={reason} onValueChange={(v) => setReason(v as OrderCancelReason)}>
            <SelectTrigger className="mt-1 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CANCEL_REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value} className="text-xs">
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <CheckboxRow
            checked={refund}
            onChange={setRefund}
            label="Issue refund"
            help="Marks the order as refunded. (Refund processing comes in Phase 3.)"
          />
          <CheckboxRow
            checked={restock}
            onChange={setRestock}
            label="Restock items"
            help="Return cancelled line items to inventory."
          />
          {isShopify && (
            <CheckboxRow
              checked={notifyCustomer}
              onChange={setNotifyCustomer}
              label="Email customer"
              help="Shopify sends the cancellation email."
            />
          )}
        </div>

        <div>
          <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
            Staff note (optional)
          </label>
          <textarea
            value={staffNote}
            onChange={(e) => setStaffNote(e.target.value)}
            rows={2}
            placeholder="Why this order is being cancelled"
            className="mt-1 w-full rounded-lg border bg-white dark:bg-gray-800 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#cdff8c]"
          />
        </div>

        {isShopify && (
          <p className="text-[10px] text-muted-foreground italic">
            Cancellation runs asynchronously in Shopify. The order will update once Shopify acknowledges — you may see a brief delay.
          </p>
        )}
      </div>

      <DialogFooter
        confirmLabel="Cancel order"
        confirmTone="destructive"
        onConfirm={handleSubmit}
        onClose={onClose}
        pending={mutation.isPending}
      />
    </ModalShell>
  );
}

// ─── Capture Payment Dialog (Shopify only) ─────────────────────────────────

function CapturePaymentDialog({
  order,
  onClose,
}: {
  order: OrderDetail;
  onClose: () => void;
}) {
  const mutation = useCaptureOrderPaymentMutation(order.id);
  // This was `Number(order.totalPrice)` — it subtracted nothing, and since the
  // input is prefilled from it, the DEFAULT action was to submit too much. The
  // dialog only opens for AUTHORIZED / PARTIALLY_PAID orders, i.e. exactly the
  // states where the total is not the balance.
  //
  // Deliberately not labelled "outstanding balance": the true capturable figure
  // is the authorisation minus what has already been captured, which lives in
  // Shopify and is not on this response. This is the honest local approximation
  // — the server enforces the real ceiling.
  const totalRefunded = (order.refunds ?? []).reduce(
    (sum, r) => sum + Number(r.amount),
    0,
  );
  const totalLessRefunds = Math.max(0, Number(order.totalPrice) - totalRefunded);
  const [amount, setAmount] = useState(totalLessRefunds.toFixed(2));
  // Matches the DTO and service default. It was `true` here — the UI defaulted
  // to closing the authorisation, the more destructive of the two.
  const [finalCapture, setFinalCapture] = useState(false);

  function handleSubmit() {
    const numeric = parseFloat(amount);
    mutation.mutate(
      {
        amount: Number.isFinite(numeric) && numeric > 0 ? numeric : undefined,
        currency: order.currency,
        finalCapture,
      },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <ModalShell
      title="Capture payment"
      subtitle={`Order ${order.name}`}
      onClose={onClose}
    >
      <div className="space-y-4 px-6 py-4">
        <div>
          <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
            Amount ({order.currency})
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border bg-white dark:bg-gray-800 px-3 py-2 text-xs tabular-nums outline-none focus:ring-1 focus:ring-[#cdff8c]"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Order total, less refunds:{" "}
            {formatCurrency(totalLessRefunds, order.currency)}
            {totalRefunded > 0 && (
              <> · {formatCurrency(totalRefunded, order.currency)} refunded</>
            )}
          </p>
        </div>

        <CheckboxRow
          checked={finalCapture}
          onChange={setFinalCapture}
          label="Close the authorization"
          help="No further captures will be possible against this auth."
        />
      </div>

      <DialogFooter
        confirmLabel="Capture"
        onConfirm={handleSubmit}
        onClose={onClose}
        pending={mutation.isPending}
      />
    </ModalShell>
  );
}

// ─── Confirm Action Dialog (Mark Paid / Close / Open) ──────────────────────

function ConfirmActionDialog({
  title,
  body,
  confirmLabel,
  mutation,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  mutation: { isPending: boolean; mutate: (vars: void, opts?: { onSuccess?: () => void }) => void };
  onClose: () => void;
}) {
  function handleConfirm() {
    mutation.mutate(undefined, { onSuccess: () => onClose() });
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <p className="px-6 py-4 text-xs text-muted-foreground">{body}</p>
      <DialogFooter
        confirmLabel={confirmLabel}
        onConfirm={handleConfirm}
        onClose={onClose}
        pending={mutation.isPending}
      />
    </ModalShell>
  );
}

