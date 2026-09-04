import { Ban, Undo2, Printer, ShoppingBag } from "lucide-react";
import { Link } from "react-router";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { QueryErrorState } from "~/components/app/query-error-state";
import { Skeleton } from "~/components/ui/skeleton";
import { cn, formatCurrency } from "~/lib/utils";
import { readAddress } from "~/lib/address";
import {
  GST_TYPE_LABELS,
  INVOICE_STATUS_CLASSES,
  INVOICE_STATUS_LABELS,
  resolveDisplayStatus,
} from "~/lib/invoice-status";
import { useInvoice } from "~/hooks/use-invoice-queries";
import type { InvoiceDetail } from "~/types/api";

interface InvoiceDetailDialogProps {
  invoiceId: string | null;
  currency: string;
  onClose: () => void;
  /** Cancelling is ORG_MANAGERS-only server-side. */
  canCancel: boolean;
  /** Hands the invoice to the shared confirmation dialog. */
  onRequestCancel: (invoice: { id: string; invoiceNumber: string }) => void;
  /**
   * Raise a credit note instead of cancelling.
   *
   * Cancelling makes an invoice VANISH from a regenerated return, which
   * silently contradicts an already-filed period. A credit note is additive.
   */
  onRequestCreditNote: (invoice: InvoiceDetail) => void;
}

/** Label above a value in the seller/buyer block. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-micro uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

/** One row of the totals ladder. */
function TotalRow({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4",
        strong && "border-t pt-1 font-semibold text-foreground"
      )}
    >
      <dt className={strong ? undefined : "text-muted-foreground"}>
        {label}
        {hint && (
          <span className="ml-1 text-micro text-muted-foreground">{hint}</span>
        )}
      </dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** Address block, rendered only when the snapshot actually holds one. */
function AddressLines({ address }: { address: unknown }) {
  const parsed = readAddress(address as Record<string, unknown> | null);
  if (!parsed.hasAddress) return null;

  return (
    <div className="mt-1 space-y-0.5">
      {parsed.lines.map((line) => (
        <p key={line} className="text-micro text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  );
}

/**
 * Full tax invoice, on the Dialog primitive.
 *
 * Replaces a hand-rolled `fixed inset-0` overlay that closed on backdrop click
 * but had no focus trap and no Escape handling, so keyboard users could tab out
 * of it into the page behind.
 */
export function InvoiceDetailDialog({
  invoiceId,
  currency,
  onClose,
  canCancel,
  onRequestCancel,
  onRequestCreditNote,
}: InvoiceDetailDialogProps) {
  const { data: invoice, isLoading, isError, refetch } = useInvoice(invoiceId);

  const money = (amount: number | string) => formatCurrency(amount, currency);
  const isIntra = invoice?.gstType === "CGST_SGST";

  // Every money field arrives as a Prisma Decimal, i.e. a STRING over the wire.
  // Coerce before comparing or the `> 0` conditionals below silently misfire.
  const num = (value: number | string | null | undefined) => Number(value ?? 0);

  return (
    <Dialog open={invoiceId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {isError ? (
          <div className="p-4">
            <QueryErrorState resource="invoice" onRetry={() => refetch()} />
          </div>
        ) : isLoading || !invoice ? (
          <div className="space-y-4 p-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <InvoiceBody
            invoice={invoice}
            isIntra={!!isIntra}
            money={money}
            num={num}
            canCancel={canCancel}
            onRequestCancel={onRequestCancel}
            onRequestCreditNote={onRequestCreditNote}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InvoiceBody({
  invoice,
  isIntra,
  money,
  num,
  canCancel,
  onRequestCancel,
  onRequestCreditNote,
}: {
  invoice: InvoiceDetail;
  isIntra: boolean;
  money: (amount: number | string) => string;
  num: (value: number | string | null | undefined) => number;
  canCancel: boolean;
  onRequestCancel: (invoice: { id: string; invoiceNumber: string }) => void;
  onRequestCreditNote: (invoice: InvoiceDetail) => void;
}) {
  const discount = num(invoice.totalDiscount);
  const shipping = num(invoice.shippingCharge);
  const isCancelled = invoice.status === "CANCELLED";

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <DialogTitle className="text-section">
              Tax invoice {invoice.invoiceNumber}
            </DialogTitle>
            <DialogDescription className="text-caption">
              {new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
              {" · FY "}
              {invoice.financialYear}
            </DialogDescription>
          </div>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-micro font-medium",
              INVOICE_STATUS_CLASSES[resolveDisplayStatus(invoice)]
            )}
          >
            {INVOICE_STATUS_LABELS[resolveDisplayStatus(invoice)]}
          </span>
        </div>
      </DialogHeader>

      {/* A cancelled invoice still carries live-looking figures, so say so
          before any of them are read. */}
      {isCancelled && (
        <div className="rounded-lg bg-danger-subtle px-3 py-2">
          <p className="text-caption font-medium text-danger">
            This invoice was cancelled
            {invoice.cancelledAt
              ? ` on ${new Date(invoice.cancelledAt).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}`
              : ""}
            . It carries no tax liability and must not be issued to the buyer.
          </p>
        </div>
      )}

      {/* Seller / buyer snapshots */}
      <div className="grid grid-cols-1 gap-6 border-t pt-4 sm:grid-cols-2">
        <div>
          <FieldLabel>Seller</FieldLabel>
          <p className="text-caption font-semibold text-foreground">
            {invoice.sellerLegalName}
          </p>
          <p className="font-mono text-micro text-muted-foreground">
            GSTIN: {invoice.sellerGstin}
          </p>
          <AddressLines address={invoice.sellerAddress} />
          <p className="text-micro text-muted-foreground">
            {invoice.sellerStateName} ({invoice.sellerStateCode})
          </p>
        </div>
        <div>
          <FieldLabel>Buyer</FieldLabel>
          <p className="text-caption font-semibold text-foreground">
            {invoice.buyerName}
          </p>
          {invoice.buyerGstin ? (
            <p className="font-mono text-micro text-muted-foreground">
              GSTIN: {invoice.buyerGstin}
            </p>
          ) : (
            <p className="text-micro italic text-muted-foreground">
              B2C — unregistered
            </p>
          )}
          <AddressLines address={invoice.buyerAddress} />
          <p className="text-micro text-muted-foreground">
            {invoice.buyerStateName} ({invoice.buyerStateCode})
          </p>
        </div>

        {/* Only when the goods left from somewhere other than the registered
            address — otherwise it repeats the seller block. */}
        {invoice.dispatchName && (
          <div>
            <FieldLabel>Dispatch from</FieldLabel>
            <p className="text-caption font-semibold text-foreground">
              {invoice.dispatchName}
            </p>
            <AddressLines address={invoice.dispatchAddress} />
          </div>
        )}
      </div>

      {/* Place of supply */}
      <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-micro">
        <span className="text-muted-foreground">
          Place of supply:{" "}
          <strong className="font-medium text-foreground">
            {invoice.placeOfSupplyName} ({invoice.placeOfSupply})
          </strong>
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
          {GST_TYPE_LABELS[invoice.gstType]}-state
        </span>
        {/* A characterization, not an amount — so it sits in this chip row and
            not in the totals ladder, whose stated invariant is that every row
            is an addend of grandTotal. */}
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
          {invoice.reverseCharge ? "Reverse charge" : "Forward charge"}
        </span>
        <span className="text-muted-foreground">
          Order{" "}
          <Link
            to={`/orders/${invoice.order.id}`}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            {invoice.order.name}
          </Link>
        </span>
      </div>

      {/* Line items */}
      <div className="overflow-x-auto border-t pt-4">
        <table className="w-full text-micro">
          <thead>
            <tr className="border-b text-left uppercase tracking-wider text-muted-foreground">
              <th className="pb-2 pr-2 font-medium">#</th>
              <th className="pb-2 pr-2 font-medium">Description</th>
              <th className="pb-2 pr-2 font-medium">HSN</th>
              <th className="pb-2 pr-2 text-right font-medium">Qty</th>
              <th className="pb-2 pr-2 text-right font-medium">Rate</th>
              <th className="pb-2 pr-2 text-right font-medium">Disc.</th>
              <th className="pb-2 pr-2 text-right font-medium">Taxable</th>
              {isIntra ? (
                <>
                  <th className="pb-2 pr-2 text-right font-medium">CGST</th>
                  <th className="pb-2 pr-2 text-right font-medium">SGST</th>
                </>
              ) : (
                <th className="pb-2 pr-2 text-right font-medium">IGST</th>
              )}
              <th className="pb-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {invoice.lineItems.map((item, index) => (
              <tr key={item.id}>
                <td className="py-2 pr-2 text-muted-foreground">{index + 1}</td>
                <td className="py-2 pr-2 text-foreground">{item.description}</td>
                <td className="py-2 pr-2 font-mono text-muted-foreground">
                  {item.hsnCode}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {item.quantity}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {money(item.unitPrice)}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">
                  {num(item.discount) > 0 ? `−${money(item.discount)}` : "—"}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {money(item.taxableValue)}
                </td>
                {isIntra ? (
                  <>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      <span className="text-muted-foreground">
                        {item.cgstRate}%
                      </span>{" "}
                      {money(item.cgstAmount)}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      <span className="text-muted-foreground">
                        {item.sgstRate}%
                      </span>{" "}
                      {money(item.sgstAmount)}
                    </td>
                  </>
                ) : (
                  <td className="py-2 pr-2 text-right tabular-nums">
                    <span className="text-muted-foreground">
                      {item.igstRate}%
                    </span>{" "}
                    {money(item.igstAmount)}
                  </td>
                )}
                <td className="py-2 text-right font-semibold tabular-nums">
                  {money(item.totalAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        Totals. Every addend of `grandTotal` appears here, in the order it is
        applied. Discount is labelled "included" because each line's discount is
        already inside its taxable value — it is reported, never subtracted a
        second time. Shipping is a real addend and was previously invisible,
        which made the grand total exceed the visible lines with nothing on the
        document to explain the difference.
      */}
      <div className="border-t pt-4">
        <dl className="ml-auto max-w-sm space-y-1 text-caption">
          {discount > 0 && (
            <TotalRow
              label="Discount"
              hint="(already applied)"
              value={`−${money(invoice.totalDiscount)}`}
            />
          )}
          <TotalRow label="Taxable value" value={money(invoice.subtotal)} />
          {isIntra ? (
            <>
              <TotalRow label="CGST" value={money(invoice.totalCgst)} />
              <TotalRow label="SGST" value={money(invoice.totalSgst)} />
            </>
          ) : (
            <TotalRow label="IGST" value={money(invoice.totalIgst)} />
          )}
          {shipping > 0 && (
            <TotalRow
              label="Shipping"
              hint="(not taxed)"
              value={money(invoice.shippingCharge)}
            />
          )}
          <TotalRow
            label="Grand total"
            value={money(invoice.grandTotal)}
            strong
          />
        </dl>
      </div>

      {invoice.notes && (
        <p className="border-t pt-3 text-micro text-muted-foreground">
          <strong className="font-medium text-foreground">Notes:</strong>{" "}
          {invoice.notes}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link
              to={`/orders/invoices/${invoice.id}/print`}
              target="_blank"
              rel="noreferrer"
            >
              <Printer />
              Print / Save as PDF
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/orders/${invoice.order.id}`}>
              <ShoppingBag />
              Open order
            </Link>
          </Button>
        </div>

        {canCancel && invoice.status === "ISSUED" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRequestCreditNote(invoice)}
            title="Reverses this invoice without deleting it — the correction to use once a period is filed"
          >
            <Undo2 />
            Credit note
          </Button>
        )}

        {canCancel && invoice.status === "ISSUED" && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() =>
              onRequestCancel({
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
              })
            }
          >
            <Ban />
            Cancel invoice
          </Button>
        )}
      </div>

      <p className="text-micro text-muted-foreground">
        Issued{" "}
        {new Date(invoice.createdAt).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </>
  );
}
