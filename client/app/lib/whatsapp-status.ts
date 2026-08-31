import type {
  BroadcastStatus,
  WhatsAppMessageStatus,
} from "~/lib/campaigns-placeholder-data";

/**
 * Canonical pill styling and labels for WhatsApp delivery states.
 *
 * Same shape and same reason as `customer-status.ts` and `order-status.ts`:
 * these maps are read by the broadcast list, the broadcast detail, the
 * automation rows and the message-log table. Inlining them per call site is
 * exactly how the order-status copies drifted.
 */

export const WA_STATUS_CLASSES: Record<WhatsAppMessageStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  sent: "bg-info-subtle text-info",
  delivered: "bg-brand/30 text-brand-strong",
  read: "bg-success-subtle text-success",
  failed: "bg-danger-subtle text-danger",
};

/** Fill-only variants, for the stacked delivery bar where text never sits on top. */
export const WA_STATUS_FILLS: Record<WhatsAppMessageStatus, string> = {
  queued: "bg-muted-foreground/30",
  sent: "bg-info",
  delivered: "bg-brand",
  read: "bg-success",
  failed: "bg-danger",
};

export const WA_STATUS_LABELS: Record<WhatsAppMessageStatus, string> = {
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
};

/**
 * Rendering order, earliest state first. Drives the breakdown bar, the tile row
 * and the list's count columns, so none of the three can fall out of sync.
 */
export const WA_STATUS_ORDER: readonly WhatsAppMessageStatus[] = [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
];

export const BROADCAST_STATUS_CLASSES: Record<BroadcastStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-info-subtle text-info",
  sending: "bg-warning-subtle text-warning",
  sent: "bg-success-subtle text-success",
  failed: "bg-danger-subtle text-danger",
};

export const BROADCAST_STATUS_LABELS: Record<BroadcastStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
};

/** Filter-row order — drives the broadcast list's segmented control. */
export const BROADCAST_STATUS_ORDER: readonly BroadcastStatus[] = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "failed",
];
