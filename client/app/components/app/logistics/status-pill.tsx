import * as React from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  PAYMENT_MODE_CLASSES,
  PAYMENT_MODE_LABELS,
  PILL_BASE,
  SHIPMENT_STATUS_CLASSES,
  SHIPMENT_STATUS_DOTS,
  SHIPMENT_STATUS_LABELS,
} from "~/lib/logistics-status";
import { describeSla, formatAwb, slaClasses } from "~/lib/logistics-format";
import { useNow } from "~/hooks/use-now";
import { cn } from "~/lib/utils";
import type { PaymentMode, ShipmentStatus } from "~/types/api";

/**
 * The status pill.
 *
 * Generic over the status maps rather than per-entity, because NDR, RTO,
 * returns, pickups and manifests all render the identical shape from their own
 * `Record<Status, string>` in `logistics-status.ts`.
 */
export function StatusPill({
  label,
  className,
  dot,
}: {
  label: string;
  /** The token pair from a `*_CLASSES` map. */
  className: string;
  /** The fill from a `*_DOTS` map. Omit for pills without a leading dot. */
  dot?: string;
}) {
  return (
    <span className={cn(PILL_BASE, className)}>
      {dot && <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />}
      {label}
    </span>
  );
}

export function ShipmentStatusPill({
  status,
  showDot = true,
}: {
  status: ShipmentStatus;
  showDot?: boolean;
}) {
  return (
    <StatusPill
      label={SHIPMENT_STATUS_LABELS[status]}
      className={SHIPMENT_STATUS_CLASSES[status]}
      dot={showDot ? SHIPMENT_STATUS_DOTS[status] : undefined}
    />
  );
}

export function PaymentPill({
  mode,
  amount,
}: {
  mode: PaymentMode;
  /** Rendered after the label for COD, so the row shows what is being collected. */
  amount?: string;
}) {
  return (
    <StatusPill
      label={mode === "COD" && amount ? `${PAYMENT_MODE_LABELS[mode]} ${amount}` : PAYMENT_MODE_LABELS[mode]}
      className={PAYMENT_MODE_CLASSES[mode]}
    />
  );
}

/**
 * A ship-by or delivery promise as a countdown pill.
 *
 * Takes its own clock via `useNow` rather than a prop: this renders once per
 * row, and hoisting the clock to the page would re-render the whole table —
 * including the filter drawer and the bulk bar — every minute.
 */
export function SlaCell({ dueAt }: { dueAt: string | null }) {
  const now = useNow(60_000);
  const state = describeSla(dueAt, now);

  if (!dueAt) return <span className="text-muted-foreground">—</span>;

  return <StatusPill label={state.label} className={slaClasses(state)} />;
}

/** AWB with copy-to-clipboard and a tracking link. */
export function AwbCell({ awb, trackingUrl }: { awb: string | null; trackingUrl?: string | null }) {
  if (!awb) {
    return <span className="text-caption text-muted-foreground">Not generated</span>;
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-caption text-foreground">{formatAwb(awb)}</span>

      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Copy AWB"
        // The raw AWB, not the grouped display form — pasting "DL48 2000 000"
        // into a courier's tracking page finds nothing.
        onClick={() => {
          navigator.clipboard.writeText(awb);
          toast.success("AWB copied.");
        }}
        className="text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
      >
        <Copy className="size-3" />
      </Button>

      {trackingUrl && (
        <a
          href={trackingUrl}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Track on the courier's site"
          className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/row:opacity-100 focus-visible:opacity-100"
        >
          <ExternalLink className="size-3" />
        </a>
      )}
    </span>
  );
}

/** Courier avatar chip. There are no logo assets, so initials stand in. */
export function CourierChip({
  name,
  initials,
  service,
}: {
  name: string | null;
  initials?: string;
  service?: string | null;
}) {
  if (!name) return <span className="text-muted-foreground">—</span>;

  const mark = initials ?? name.slice(0, 2).toUpperCase();

  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-micro font-semibold text-muted-foreground">
        {mark}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-body text-foreground">{name}</span>
        {service && <span className="block text-micro text-muted-foreground">{service}</span>}
      </span>
    </span>
  );
}

/** Two-line cell: a strong primary value over a muted secondary one. */
export function StackedCell({
  primary,
  secondary,
  mono = false,
  secondaryMono = false,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  mono?: boolean;
  /** Mono only the second line — AWBs and SKUs under a plain-text label. */
  secondaryMono?: boolean;
}) {
  return (
    <span className="block min-w-0">
      <span
        className={cn(
          "block truncate text-body font-medium text-foreground",
          mono && "font-mono text-caption",
        )}
      >
        {primary}
      </span>
      {secondary && (
        <span
          className={cn(
            "block truncate text-muted-foreground",
            secondaryMono ? "font-mono text-micro" : "text-caption",
          )}
        >
          {secondary}
        </span>
      )}
    </span>
  );
}
