import type {
  CarrierAccountState,
  PaymentMode,
  ReturnKind,
  ReturnStage,
  ShipmentStatus,
  ShipmentStatusGroup,
  ShippableOrderStatus,
  ShipmentServiceType,
} from "~/types/api";

/**
 * Canonical logistics pill styling and labels.
 *
 * Same shape and same reason as `order-status.ts` / `invoice-status.ts`: the
 * previous logistics page inlined its map in the route file on raw palette
 * utilities (`bg-blue-100 text-blue-700`, `bg-[#CEF17B]/40 text-[#084734]`), so
 * the list, the detail view and the overview had no way to agree.
 *
 * Every class here resolves to a token, so dark mode needs no `dark:` variants.
 */

/* ─── Shipment ──────────────────────────────────────────────────────────── */

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  DRAFT: "Draft",
  COURIER_ASSIGNED: "Courier assigned",
  AWB_ASSIGNED: "AWB assigned",
  READY_TO_SHIP: "Ready to ship",
  PICKUP_SCHEDULED: "Pickup scheduled",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  DELAYED: "Delayed",
  NDR: "NDR",
  RTO_INITIATED: "RTO initiated",
  RTO_IN_TRANSIT: "RTO in transit",
  RTO_DELIVERED: "RTO delivered",
  CANCELLED: "Cancelled",
};

export const SHIPMENT_STATUS_CLASSES: Record<ShipmentStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  COURIER_ASSIGNED: "bg-muted text-foreground",
  AWB_ASSIGNED: "bg-info-subtle text-info",
  READY_TO_SHIP: "bg-info-subtle text-info",
  PICKUP_SCHEDULED: "bg-warning-subtle text-warning-strong",
  PICKED_UP: "bg-warning-subtle text-warning-strong",
  IN_TRANSIT: "bg-info-subtle text-info",
  OUT_FOR_DELIVERY: "bg-warning-strong-subtle text-warning-strong",
  DELIVERED: "bg-brand/30 text-brand-strong",
  DELAYED: "bg-warning-strong-subtle text-warning-strong",
  NDR: "bg-danger-subtle text-danger",
  RTO_INITIATED: "bg-danger-subtle text-danger",
  RTO_IN_TRANSIT: "bg-danger-subtle text-danger",
  RTO_DELIVERED: "bg-danger-subtle text-danger",
  CANCELLED: "bg-muted text-muted-foreground",
};

/** Leading row dot — the pill fill on its own. */
export const SHIPMENT_STATUS_DOTS: Record<ShipmentStatus, string> = {
  DRAFT: "bg-muted-foreground/40",
  COURIER_ASSIGNED: "bg-muted-foreground",
  AWB_ASSIGNED: "bg-info",
  READY_TO_SHIP: "bg-info",
  PICKUP_SCHEDULED: "bg-warning",
  PICKED_UP: "bg-warning",
  IN_TRANSIT: "bg-info",
  OUT_FOR_DELIVERY: "bg-warning-strong",
  DELIVERED: "bg-brand",
  DELAYED: "bg-warning-strong",
  NDR: "bg-danger",
  RTO_INITIATED: "bg-danger",
  RTO_IN_TRANSIT: "bg-danger",
  RTO_DELIVERED: "bg-danger",
  CANCELLED: "bg-muted-foreground/40",
};

/**
 * The forward journey, in order, for the stepper on the shipment detail page.
 *
 * RTO, DELAYED, NDR and CANCELLED are deliberately absent: they are branches
 * off this line, not stages on it. The detail page renders them as a banner and
 * as exception nodes in the timeline instead.
 */
export const SHIPMENT_JOURNEY: ShipmentStatus[] = [
  "DRAFT",
  "COURIER_ASSIGNED",
  "AWB_ASSIGNED",
  "READY_TO_SHIP",
  "PICKUP_SCHEDULED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

/** Short labels for the stepper, where each node has ~70px of width. */
export const SHIPMENT_JOURNEY_LABELS: Record<ShipmentStatus, string> = {
  ...SHIPMENT_STATUS_LABELS,
  COURIER_ASSIGNED: "Courier",
  AWB_ASSIGNED: "AWB",
  READY_TO_SHIP: "Packed",
  PICKUP_SCHEDULED: "Scheduled",
  OUT_FOR_DELIVERY: "Out for delivery",
};

/**
 * Which coarse tab a status belongs to.
 *
 * DELAYED lands in EXCEPTION rather than IN_TRANSIT on purpose — the point of
 * that tab is "things that need me", and a delayed parcel does.
 */
const STATUS_GROUP: Record<ShipmentStatus, Exclude<ShipmentStatusGroup, "ALL">> = {
  DRAFT: "READY",
  COURIER_ASSIGNED: "READY",
  AWB_ASSIGNED: "READY",
  READY_TO_SHIP: "READY",
  PICKUP_SCHEDULED: "READY",
  PICKED_UP: "IN_TRANSIT",
  IN_TRANSIT: "IN_TRANSIT",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  DELAYED: "EXCEPTION",
  NDR: "EXCEPTION",
  RTO_INITIATED: "EXCEPTION",
  RTO_IN_TRANSIT: "EXCEPTION",
  RTO_DELIVERED: "EXCEPTION",
  CANCELLED: "EXCEPTION",
};

export function shipmentGroup(status: ShipmentStatus): ShipmentStatusGroup {
  return STATUS_GROUP[status];
}

export const SHIPMENT_GROUP_LABELS: Record<ShipmentStatusGroup, string> = {
  ALL: "All",
  READY: "Ready to ship",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  EXCEPTION: "Exceptions",
};

export const SERVICE_TYPE_LABELS: Record<ShipmentServiceType, string> = {
  SURFACE: "Surface",
  EXPRESS: "Express",
  AIR: "Air",
  SAME_DAY: "Same day",
};

/* ─── Payment ───────────────────────────────────────────────────────────── */

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  PREPAID: "Prepaid",
  COD: "COD",
};

export const PAYMENT_MODE_CLASSES: Record<PaymentMode, string> = {
  PREPAID: "bg-brand/30 text-brand-strong",
  COD: "bg-warning-subtle text-warning-strong",
};

/* ─── Orders to ship ────────────────────────────────────────────────────── */

export const SHIPPABLE_STATUS_LABELS: Record<ShippableOrderStatus, string> = {
  UNFULFILLED: "Unfulfilled",
  READY_TO_PROCESS: "Ready to process",
  ON_HOLD: "On hold",
  EXCEPTION: "Exception",
  PARTIALLY_SHIPPED: "Partially shipped",
};

export const SHIPPABLE_STATUS_CLASSES: Record<ShippableOrderStatus, string> = {
  UNFULFILLED: "bg-muted text-muted-foreground",
  READY_TO_PROCESS: "bg-info-subtle text-info",
  ON_HOLD: "bg-warning-subtle text-warning-strong",
  EXCEPTION: "bg-danger-subtle text-danger",
  PARTIALLY_SHIPPED: "bg-warning-strong-subtle text-warning-strong",
};

/** The one pill shape used across the module. */
export const PILL_BASE =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium whitespace-nowrap";

/* ─── Returns & RTO ─────────────────────────────────────────────────────── */

export const RETURN_STAGE_LABELS: Record<ReturnStage, string> = {
  REQUESTED: "Requested",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  RECEIVED: "Received",
  REFUNDED: "Refunded",
  EXCEPTION: "Exception",
};

export const RETURN_STAGE_CLASSES: Record<ReturnStage, string> = {
  REQUESTED: "bg-muted text-muted-foreground",
  IN_TRANSIT: "bg-info-subtle text-info",
  OUT_FOR_DELIVERY: "bg-warning-strong-subtle text-warning-strong",
  RECEIVED: "bg-brand/30 text-brand-strong",
  REFUNDED: "bg-brand/30 text-brand-strong",
  EXCEPTION: "bg-danger-subtle text-danger",
};

export const RETURN_KIND_LABELS: Record<ReturnKind, string> = {
  CUSTOMER_RETURN: "Customer return",
  RTO: "RTO",
};

/* ─── Carriers ──────────────────────────────────────────────────────────── */

export const CARRIER_STATE_LABELS: Record<CarrierAccountState, string> = {
  CONNECTED: "Connected",
  RATE_LIMITED: "Rate limited",
  NOT_LINKED: "Not linked",
};

export const CARRIER_STATE_CLASSES: Record<CarrierAccountState, string> = {
  CONNECTED: "bg-brand/30 text-brand-strong",
  RATE_LIMITED: "bg-warning-subtle text-warning-strong",
  NOT_LINKED: "bg-muted text-muted-foreground",
};

/* ─── Meters ────────────────────────────────────────────────────────────── */

/**
 * Fill colours for the horizontal share bars used by Returns, Zones and
 * Analytics.
 *
 * The design used raw hex for these (`#f5a3a3`, `#fbbf24`, `#d4d4d4`); mapping
 * them to tokens here is what keeps the bars legible in dark mode, where a
 * fixed pale pink on a dark card disappears.
 */
export type MeterTone = "brand" | "danger" | "warning" | "neutral" | "info" | "success" | "muted";

export const METER_FILL: Record<MeterTone, string> = {
  brand: "bg-brand",
  danger: "bg-danger/55",
  warning: "bg-warning",
  neutral: "bg-muted-foreground/35",
  info: "bg-info/70",
  success: "bg-brand-mid",
  muted: "bg-muted-foreground/20",
};

/** The same tones as a small square swatch, for legends. */
export const METER_SWATCH: Record<MeterTone, string> = METER_FILL;
