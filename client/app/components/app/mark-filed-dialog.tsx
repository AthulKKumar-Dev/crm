import { useState } from "react";
import { Loader2, Lock, LockOpen } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  useMarkFiledMutation,
  useUnfileMutation,
} from "~/hooks/use-invoice-mutations";
import type { GstFiling } from "~/types/api";

interface MarkFiledDialogProps {
  open: boolean;
  onClose: () => void;
  financialYear: string;
  period: string;
  periodLabel: string;
  returnType: "GSTR1" | "GSTR3B";
  /** Registration this filing covers; omitted means every registration. */
  sellerGstinId?: string;
  gstinLabel: string;
}

/**
 * Record that a period has been filed, locking it.
 *
 * The server has enforced this lock since credit notes shipped — issuing or
 * cancelling an invoice inside a filed period is refused — but nothing in the
 * UI could ever set it, so the whole mechanism was unreachable. This is that
 * missing control.
 *
 * The ARN is optional because a merchant often marks the period done at the
 * moment they file and only receives the acknowledgement number afterwards;
 * requiring it up front would push people to either lie or skip the lock.
 */
export function MarkFiledDialog({
  open,
  onClose,
  financialYear,
  period,
  periodLabel,
  returnType,
  sellerGstinId,
  gstinLabel,
}: MarkFiledDialogProps) {
  const [arn, setArn] = useState("");
  const markFiled = useMarkFiledMutation();

  function handleConfirm() {
    markFiled.mutate(
      {
        financialYear,
        period,
        returnType,
        sellerGstinId,
        arn: arn.trim() || undefined,
      },
      {
        onSuccess: () => {
          setArn("");
          onClose();
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !markFiled.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark {returnType} as filed</DialogTitle>
          <DialogDescription>
            {periodLabel} · {gstinLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-caption">
          <p className="text-muted-foreground">
            Invoices dated in this period can no longer be issued or cancelled
            under {gstinLabel}. Corrections after filing go through credit
            notes, which are additive and leave a trail.
          </p>
          <p className="text-muted-foreground">
            The figures shown on this screen are snapshotted, so you can compare
            them later against what the system recomputes.
          </p>

          <label className="block space-y-1">
            <span className="font-medium text-foreground">
              ARN{" "}
              <span className="font-normal text-muted-foreground">
                (optional — add it once the portal gives you one)
              </span>
            </span>
            <Input
              value={arn}
              onChange={(e) => setArn(e.target.value.toUpperCase())}
              placeholder="AA270926000000X"
              maxLength={64}
              className="h-8 font-mono text-caption"
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={markFiled.isPending}>
            Cancel
          </Button>
          <Button variant="brand" onClick={handleConfirm} disabled={markFiled.isPending}>
            {markFiled.isPending ? <Loader2 className="animate-spin" /> : <Lock />}
            Mark as filed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Reopen a period filed in error.
 *
 * Separate from the lock itself because it is the escape hatch, not the normal
 * path: the statutory way to fix a filed period is a credit note in the current
 * one. Reopening is for the case where the lock was set by mistake.
 */
export function ReopenPeriodDialog({
  filing,
  periodLabel,
  onClose,
}: {
  filing: GstFiling | null;
  periodLabel: string;
  onClose: () => void;
}) {
  const unfile = useUnfileMutation();

  return (
    <Dialog
      open={filing !== null}
      onOpenChange={(next) => {
        if (!next && !unfile.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reopen {periodLabel}?</DialogTitle>
          <DialogDescription>
            This removes the lock so invoices in this period can be issued and
            cancelled again.
          </DialogDescription>
        </DialogHeader>

        <p className="text-caption text-muted-foreground">
          Only do this if the period was marked filed by mistake. If the return
          really was filed, editing these documents makes your records disagree
          with what the government already holds — raise a credit note in the
          current period instead.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={unfile.isPending}>
            Keep it locked
          </Button>
          <Button
            variant="destructive"
            disabled={unfile.isPending}
            onClick={() =>
              filing &&
              unfile.mutate(filing.id, { onSuccess: () => onClose() })
            }
          >
            {unfile.isPending ? <Loader2 className="animate-spin" /> : <LockOpen />}
            Reopen period
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
