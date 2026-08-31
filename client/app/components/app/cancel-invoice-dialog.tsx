import { Ban, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { useCancelInvoiceMutation } from "~/hooks/use-invoice-mutations";

interface CancelInvoiceDialogProps {
  /** The invoice to cancel, or null when the dialog is closed. */
  invoice: { id: string; invoiceNumber: string } | null;
  onClose: () => void;
  /** Fired after the server confirms the cancellation. */
  onCancelled?: () => void;
}

/**
 * Confirmation for cancelling a GST invoice.
 *
 * Cancelling used to fire straight from a dropdown item and from the detail
 * dialog's footer button — one click, no confirmation, on an action the server
 * offers no way back from (the only correction path is cancel-then-reissue,
 * which burns a new invoice number). A mis-aimed cancel is a statutory problem,
 * not a UI annoyance: five live production invoices were wrongly cancelled by a
 * script on 2026-08-03 and the restore could only reconstruct their status.
 *
 * Built on the `Dialog` primitive rather than `ModalShell` for the reason given
 * in `invoice-detail-dialog.tsx`: the hand-rolled overlay had no focus trap and
 * no Escape handling, which matters most on a destructive confirm.
 */
export function CancelInvoiceDialog({
  invoice,
  onClose,
  onCancelled,
}: CancelInvoiceDialogProps) {
  const cancelInvoice = useCancelInvoiceMutation();

  function handleConfirm() {
    if (!invoice) return;
    cancelInvoice.mutate(invoice.id, {
      onSuccess: () => {
        onCancelled?.();
        onClose();
      },
    });
  }

  return (
    <Dialog
      open={invoice !== null}
      onOpenChange={(open) => {
        // Don't let a backdrop click or Escape close the dialog mid-request —
        // the mutation would still land with no confirmation on screen.
        if (!open && !cancelInvoice.isPending) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel invoice {invoice?.invoiceNumber}?</DialogTitle>
          <DialogDescription className="text-caption">
            This is permanent. A cancelled GST invoice cannot be reinstated — to
            correct one, cancel it and issue a new invoice against the same
            order, which will take the next invoice number.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={cancelInvoice.isPending}
          >
            Keep invoice
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={cancelInvoice.isPending}
          >
            {cancelInvoice.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Ban />
            )}
            Cancel invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
