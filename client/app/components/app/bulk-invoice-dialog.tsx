import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { FileText, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { useBulkCreateInvoicesMutation } from "~/hooks/use-invoice-mutations";
import type { BulkInvoiceResult } from "~/types/api";

/**
 * Issue GST invoices for the orders ticked on the Orders list.
 *
 * Two steps: a confirmation that states the rules (which orders qualify, where
 * the GST details come from, that serials are permanent), then the per-order
 * outcome. Every order is accounted for — issued, skipped with the reason, or
 * failed with the server's message.
 *
 * `onClose(done)` reports whether a batch was submitted, so the list can clear
 * a selection that has already been acted on.
 */
export function BulkInvoiceDialog({
  open,
  orderIds,
  onClose,
}: {
  open: boolean;
  orderIds: string[];
  onClose: (done: boolean) => void;
}) {
  const bulkCreate = useBulkCreateInvoicesMutation();
  const { reset } = bulkCreate;
  const result = bulkCreate.data;
  const count = orderIds.length;
  // `isPending` only updates on the next render, so a double click lands two
  // `mutate` calls first. The second batch would find every order already
  // invoiced, and its all-skipped result would replace the first one's list of
  // issued invoices. A ref closes that window synchronously.
  const submitting = useRef(false);

  // Clear the last batch when the dialog OPENS rather than when it closes: a
  // reset on close swaps the results back to the confirm step while the
  // dialog is still fading out.
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  function submit() {
    if (submitting.current) return;
    submitting.current = true;
    bulkCreate.mutate(orderIds, {
      onSettled: () => {
        submitting.current = false;
      },
    });
  }

  function close() {
    onClose(result !== undefined);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't dismiss mid-request — invoices would still be issued with no
        // dialog left to report which.
        if (!next && !bulkCreate.isPending) close();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        {result ? (
          <BulkInvoiceResults result={result} onClose={close} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                Generate GST invoices for {count} order{count === 1 ? "" : "s"}?
              </DialogTitle>
              <DialogDescription className="text-caption">
                Each order gets its own invoice, issued oldest order first.
              </DialogDescription>
            </DialogHeader>

            <ul className="list-disc space-y-1.5 pl-5 text-label text-muted-foreground">
              <li>
                Only <span className="font-medium text-foreground">paid</span> orders that are
                not cancelled and not yet invoiced are invoiced. The rest are listed afterwards
                with the reason.
              </li>
              <li>
                Seller GSTIN, place of supply and dispatch location are taken from each order,
                as with auto-invoicing. Use the order page for a buyer GSTIN or reverse charge.
              </li>
              <li>Invoice numbers are statutory serials and cannot be reused.</li>
            </ul>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={close}
                disabled={bulkCreate.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="brand"
                size="sm"
                onClick={submit}
                disabled={bulkCreate.isPending || count === 0}
              >
                {bulkCreate.isPending ? <Loader2 className="animate-spin" /> : <FileText />}
                {bulkCreate.isPending ? "Generating…" : "Generate invoices"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BulkInvoiceResults({
  result,
  onClose,
}: {
  result: BulkInvoiceResult;
  onClose: () => void;
}) {
  const { issued, skipped, failed } = result;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Invoice generation finished</DialogTitle>
        <DialogDescription className="text-caption">
          {issued.length} issued · {skipped.length} skipped · {failed.length} failed
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {issued.length > 0 && (
          <ResultGroup title="Issued">
            {issued.map((i) => (
              <ResultRow key={i.orderId} order={i.orderName}>
                <Link
                  to={`/orders/invoices/${i.invoiceId}`}
                  // Close first, so the modal's body lock is released by Radix
                  // rather than by the page unmounting under it.
                  onClick={onClose}
                  className="font-medium text-brand-strong underline-offset-2 hover:underline"
                >
                  {i.invoiceNumber}
                </Link>
              </ResultRow>
            ))}
          </ResultGroup>
        )}
        {failed.length > 0 && (
          <ResultGroup title="Failed" tone="danger">
            {failed.map((f) => (
              <ResultRow key={f.orderId} order={f.orderName}>
                <span className="text-destructive">{f.reason}</span>
              </ResultRow>
            ))}
          </ResultGroup>
        )}
        {skipped.length > 0 && (
          <ResultGroup title="Skipped">
            {skipped.map((s) => (
              <ResultRow key={s.orderId} order={s.orderName ?? "Unknown order"}>
                <span className="text-muted-foreground">{s.reason}</span>
              </ResultRow>
            ))}
          </ResultGroup>
        )}
      </div>

      <DialogFooter>
        <Button variant="brand" size="sm" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

function ResultGroup({
  title,
  tone = "default",
  children,
}: {
  title: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <section>
      <p
        className={`mb-1 text-micro font-medium uppercase tracking-wide ${
          tone === "danger" ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {title}
      </p>
      <div className="divide-y divide-border rounded-lg border border-border">{children}</div>
    </section>
  );
}

function ResultRow({ order, children }: { order: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2 text-label">
      <span className="shrink-0 font-medium text-foreground">{order}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
