import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Trash2,
  FileText,
  ExternalLink,
} from "lucide-react";
import { useDraftOrder } from "~/hooks/use-draft-order-queries";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import {
  useDeleteDraftOrderMutation,
  useCompleteDraftOrderMutation,
} from "~/hooks/use-draft-order-mutations";
import { cn, formatCurrency } from "~/lib/utils";
import {
  ModalShell,
  DialogFooter,
  CheckboxRow,
} from "~/components/app/order-dialog-primitives";
import type { DraftOrderStatus, OfflinePaymentMethod } from "~/types/api";

export function meta() {
  return [{ title: "Draft | Collabo CRM" }];
}

const STATUS_LABEL: Record<DraftOrderStatus, string> = {
  OPEN: "Open",
  INVOICE_SENT: "Invoice sent",
  COMPLETED: "Completed",
};

const STATUS_CLASS: Record<DraftOrderStatus, string> = {
  OPEN: "bg-blue-100 text-blue-700",
  INVOICE_SENT: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-[#CEF17B]/30 text-[#084734]",
};

export default function DraftDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: draft, isLoading } = useDraftOrder(id);
  const { data: org } = useCurrentOrg();
  const currency = draft?.currency ?? org?.currency ?? "INR";

  const deleteDraft = useDeleteDraftOrderMutation();
  const completeDraft = useCompleteDraftOrderMutation(id!);

  const [showComplete, setShowComplete] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  if (isLoading || !draft) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isCompleted = draft.status === "COMPLETED";
  const isShopify = draft.channel.platform === "SHOPIFY";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/orders/drafts"
            className="mb-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100"
          >
            <ArrowLeft className="size-3.5" />
            Back to drafts
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {draft.name ?? `Draft ${draft.id.slice(-6)}`}
            </h1>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                STATUS_CLASS[draft.status],
              )}
            >
              {STATUS_LABEL[draft.status]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Created {new Date(draft.createdAt).toLocaleString("en-IN")} • Updated{" "}
            {new Date(draft.updatedAt).toLocaleString("en-IN")}
            {draft.channel && ` • ${draft.channel.name}`}
          </p>
        </div>
        {!isCompleted && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-white dark:bg-gray-900 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 className="size-3.5" />
              Delete
            </button>
            <button
              onClick={() => setShowComplete(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#CEF17B] px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-[#BADE6F]"
            >
              <CheckCircle2 className="size-3.5" />
              Complete draft
            </button>
          </div>
        )}
      </div>

      {/* Banner for completed drafts pointing to the resulting order */}
      {isCompleted && draft.completedOrder && (
        <div className="rounded-xl border border-[#CEF17B] bg-[#CEF17B]/10 px-4 py-3 text-xs">
          <p className="font-medium text-[#084734]">
            This draft was completed as order{" "}
            <Link
              to={`/orders/${draft.completedOrder.id}`}
              className="underline hover:no-underline inline-flex items-center gap-1"
            >
              {draft.completedOrder.name}
              <ExternalLink className="size-3" />
            </Link>
            .
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Customer */}
          <Section title="Customer">
            {draft.customer ? (
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {(draft.customer.firstName ?? "") +
                    " " +
                    (draft.customer.lastName ?? "")}
                </p>
                {draft.customer.email && (
                  <p className="text-xs text-muted-foreground">
                    {draft.customer.email}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Anonymous draft — no customer attached yet.
              </p>
            )}
          </Section>

          {/* Line items */}
          <Section title={`Line items (${draft.lineItems.length})`}>
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-5 py-2 text-left font-medium">Item</th>
                    <th className="px-5 py-2 text-right font-medium">Qty</th>
                    <th className="px-5 py-2 text-right font-medium">Unit price</th>
                    <th className="px-5 py-2 text-right font-medium">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {draft.lineItems.map((li) => (
                    <tr key={li.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {li.title}
                        </p>
                        {li.variantTitle && (
                          <p className="text-[10px] text-muted-foreground">
                            {li.variantTitle}
                          </p>
                        )}
                        {li.sku && (
                          <p className="text-[10px] font-mono text-muted-foreground">
                            SKU {li.sku}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {li.quantity}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {formatCurrency(li.price, currency)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold">
                        {formatCurrency(
                          Number(li.price) * li.quantity,
                          currency,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Totals */}
          <Section title="Totals">
            <div className="space-y-1 text-xs">
              <Row
                label="Subtotal"
                value={formatCurrency(draft.subtotalPrice, currency)}
              />
              <Row
                label="Tax"
                value={formatCurrency(draft.totalTax, currency)}
              />
              {Number(draft.totalShippingPrice) > 0 && (
                <Row
                  label="Shipping"
                  value={formatCurrency(draft.totalShippingPrice, currency)}
                />
              )}
              <div className="mt-2 border-t pt-2">
                <Row
                  label="Estimated total"
                  value={formatCurrency(draft.totalPrice, currency)}
                  highlight="bold"
                />
              </div>
            </div>
          </Section>

          {draft.note && (
            <Section title="Note">
              <p className="text-xs whitespace-pre-wrap">{draft.note}</p>
            </Section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Section title="Status">
            <div className="space-y-2 text-xs">
              <DescRow label="Status" value={STATUS_LABEL[draft.status]} />
              <DescRow label="Items" value={String(draft.lineItems.length)} />
              {draft.completedAt && (
                <DescRow
                  label="Completed"
                  value={new Date(draft.completedAt).toLocaleDateString("en-IN")}
                />
              )}
              {draft.invoiceSentAt && (
                <DescRow
                  label="Invoice sent"
                  value={new Date(draft.invoiceSentAt).toLocaleDateString(
                    "en-IN",
                  )}
                />
              )}
              {draft.invoiceUrl && (
                <p className="text-[10px]">
                  <a
                    href={draft.invoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    Shopify invoice link
                    <ExternalLink className="size-3" />
                  </a>
                </p>
              )}
            </div>
          </Section>

          <Section title="Channel">
            <p className="text-xs text-gray-900 dark:text-gray-100">
              {draft.channel.name}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {draft.channel.platform}
            </p>
            {isShopify && (
              <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-400">
                Shopify drafts are not yet mirrored from this CRM — completion
                is supported via the offline path for now.
              </p>
            )}
          </Section>
        </div>
      </div>

      {/* Complete dialog */}
      {showComplete && (
        <CompleteDraftDialog
          isPending={completeDraft.isPending}
          onClose={() => setShowComplete(false)}
          onSubmit={(payload) =>
            completeDraft.mutate(payload, {
              onSuccess: (result) => {
                setShowComplete(false);
                navigate(`/orders/${result.order.id}`);
              },
            })
          }
        />
      )}

      {/* Delete confirm dialog */}
      {showDelete && (
        <ModalShell title="Delete this draft?" onClose={() => setShowDelete(false)}>
          <p className="px-6 py-4 text-xs text-muted-foreground">
            The draft will be removed from your list. This can't be undone.
          </p>
          <DialogFooter
            confirmLabel="Delete"
            confirmTone="destructive"
            onConfirm={() =>
              deleteDraft.mutate(draft.id, {
                onSuccess: () => navigate("/orders/drafts"),
              })
            }
            onClose={() => setShowDelete(false)}
            pending={deleteDraft.isPending}
          />
        </ModalShell>
      )}
    </div>
  );
}

function CompleteDraftDialog({
  isPending,
  onClose,
  onSubmit,
}: {
  isPending: boolean;
  onClose: () => void;
  onSubmit: (data: {
    paymentMethod: OfflinePaymentMethod;
    generateInvoice: boolean;
  }) => void;
}) {
  const [paymentMethod, setPaymentMethod] =
    useState<OfflinePaymentMethod>("CASH");
  const [generateInvoice, setGenerateInvoice] = useState(true);

  return (
    <ModalShell title="Complete draft" onClose={onClose}>
      <div className="space-y-4 px-6 py-4">
        <p className="text-xs text-muted-foreground">
          Converts this draft into a finalized order. Inventory, customer
          counters, and (optionally) a GST invoice will all be created.
        </p>

        <div>
          <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
            Payment method
          </label>
          <select
            value={paymentMethod}
            onChange={(e) =>
              setPaymentMethod(e.target.value as OfflinePaymentMethod)
            }
            className="mt-1 h-9 w-full rounded-lg border border-input bg-white dark:bg-gray-800 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#CEF17B]/60"
          >
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="UPI">UPI</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <CheckboxRow
          checked={generateInvoice}
          onChange={setGenerateInvoice}
          label="Generate GST invoice"
          help="Soft-fails if GSTIN isn't configured — completion still succeeds."
        />
      </div>
      <DialogFooter
        confirmLabel="Complete & create order"
        onConfirm={() => onSubmit({ paymentMethod, generateInvoice })}
        onClose={onClose}
        pending={isPending}
      />
    </ModalShell>
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
  highlight?: "bold";
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
        className={cn("tabular-nums", highlight === "bold" && "font-semibold")}
      >
        {value}
      </span>
    </div>
  );
}

function DescRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
}
