import { Ban, Loader2 } from "lucide-react";

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
import {
  GST_TYPE_LABELS,
  INVOICE_STATUS_CLASSES,
  INVOICE_STATUS_LABELS,
  resolveDisplayStatus,
} from "~/lib/invoice-status";
import { useInvoice } from "~/hooks/use-invoice-queries";
import { useCancelInvoiceMutation } from "~/hooks/use-invoice-mutations";

interface InvoiceDetailDialogProps {
  invoiceId: string | null;
  currency: string;
  onClose: () => void;
}

/** Label above a value in the seller/buyer block. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-micro uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
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
}: InvoiceDetailDialogProps) {
  const { data: invoice, isLoading, isError, refetch } = useInvoice(invoiceId);
  const cancelInvoice = useCancelInvoiceMutation();

  const money = (amount: number) => formatCurrency(amount, currency);
  const isIntra = invoice?.gstType === "CGST_SGST";

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
                <p className="text-micro text-muted-foreground">
                  {invoice.buyerStateName} ({invoice.buyerStateCode})
                </p>
              </div>
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
              {invoice.reverseCharge && (
                <span className="rounded-full bg-warning-strong-subtle px-2 py-0.5 font-medium text-warning-strong">
                  Reverse charge
                </span>
              )}
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

            {/* Totals */}
            <div className="border-t pt-4">
              <dl className="ml-auto max-w-xs space-y-1 text-caption">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">{money(invoice.subtotal)}</dd>
                </div>
                {isIntra ? (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">CGST</dt>
                      <dd className="tabular-nums">{money(invoice.totalCgst)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">SGST</dt>
                      <dd className="tabular-nums">{money(invoice.totalSgst)}</dd>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">IGST</dt>
                    <dd className="tabular-nums">{money(invoice.totalIgst)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 font-semibold text-foreground">
                  <dt>Grand total</dt>
                  <dd className="tabular-nums">{money(invoice.grandTotal)}</dd>
                </div>
              </dl>
            </div>

            {invoice.notes && (
              <p className="border-t pt-3 text-micro text-muted-foreground">
                <strong className="font-medium text-foreground">Notes:</strong>{" "}
                {invoice.notes}
              </p>
            )}

            {invoice.status === "ISSUED" && (
              <div className="border-t pt-4">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => cancelInvoice.mutate(invoice.id)}
                  disabled={cancelInvoice.isPending}
                >
                  {cancelInvoice.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Ban />
                  )}
                  Cancel invoice
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
