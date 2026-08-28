import type { FinancialStatus, FulfillmentStatus } from "~/types/api";

/**
 * Canonical order-status pill styling and labels.
 *
 * These maps used to be copy-pasted into orders-table.tsx and orders/$id.tsx.
 * The detail-page copy drifted: it used raw hex instead of tokens and rendered
 * the bare enum, so the page read "PARTIALLY_PAID" where the table read
 * "Partial". One source now, imported by both.
 */

export const FINANCIAL_CLASSES: Record<FinancialStatus, string> = {
  PAID: "bg-brand/30 text-brand-strong",
  PARTIALLY_PAID: "bg-info-subtle text-info",
  PENDING: "bg-warning-strong-subtle text-warning-strong",
  AUTHORIZED: "bg-info-subtle text-info",
  PARTIALLY_REFUNDED: "bg-warning-subtle text-warning",
  REFUNDED: "bg-muted text-muted-foreground",
  VOIDED: "bg-danger-subtle text-danger",
};

export const FULFILLMENT_CLASSES: Record<FulfillmentStatus, string> = {
  FULFILLED: "bg-brand/30 text-brand-strong",
  PARTIAL: "bg-info-subtle text-info",
  UNFULFILLED: "bg-warning-strong-subtle text-warning-strong",
  RESTOCKED: "bg-muted text-muted-foreground",
};

/** Short labels — for the list table, where the column is narrow. */
export const FINANCIAL_LABELS: Record<FinancialStatus, string> = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partial",
  PENDING: "Pending",
  AUTHORIZED: "Authorized",
  PARTIALLY_REFUNDED: "Partial Refund",
  REFUNDED: "Refunded",
  VOIDED: "Voided",
};

export const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  FULFILLED: "Fulfilled",
  PARTIAL: "Partial",
  UNFULFILLED: "Unfulfilled",
  RESTOCKED: "Restocked",
};

/** Full labels — for the detail page, where there is room to be unambiguous. */
export const FINANCIAL_LABELS_FULL: Record<FinancialStatus, string> = {
  ...FINANCIAL_LABELS,
  PARTIALLY_PAID: "Partially paid",
  PARTIALLY_REFUNDED: "Partially refunded",
};

export const FULFILLMENT_LABELS_FULL: Record<FulfillmentStatus, string> = {
  ...FULFILLMENT_LABELS,
  PARTIAL: "Partly fulfilled",
};

/**
 * Per-line fulfilment state. The API returns a lowercase free-form string:
 * null | 'fulfilled' | 'delivered' | 'on_hold' | 'in_progress'.
 */
export const LINE_STATUS_CLASSES: Record<string, string> = {
  fulfilled: "bg-brand/30 text-brand-strong",
  delivered: "bg-success-subtle text-success",
  in_progress: "bg-info-subtle text-info",
  on_hold: "bg-muted text-muted-foreground",
  // Amber, matching the "Partly shipped" group on the order detail page. It was
  // blue, which made it indistinguishable from in_progress — two different
  // things (units already gone out vs. being prepared).
  partial: "bg-warning-subtle text-warning",
};

export const LINE_STATUS_LABELS: Record<string, string> = {
  fulfilled: "Fulfilled",
  delivered: "Delivered",
  in_progress: "In progress",
  on_hold: "On hold",
  partial: "Partly shipped",
};

/** `null` means the line was never actioned — the API stores no "unfulfilled" value. */
export function lineStatusLabel(status: string | null): string {
  if (!status) return "Unfulfilled";
  return LINE_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function lineStatusClass(status: string | null): string {
  if (!status) return "bg-warning-strong-subtle text-warning-strong";
  return LINE_STATUS_CLASSES[status] ?? "bg-muted text-muted-foreground";
}

/** A line counts as done when it is fulfilled or already delivered — matches the server predicate. */
export function isLineFulfilled(status: string | null): boolean {
  return status === "fulfilled" || status === "delivered";
}

/**
 * Suggested shipping carriers, shared by every tracking input on the order
 * detail page.
 *
 * These are *suggestions*, not a closed set — each input is free text backed by
 * a `<datalist>`. Shopify's `fulfillmentTrackingInfoUpdate` accepts an arbitrary
 * carrier string, so restricting the UI to a dropdown only prevents recording a
 * shipment we can otherwise represent perfectly well. The per-line and bulk
 * inputs used to be a hardcoded one-entry `<select>` (`["Shiprocket"]`) while
 * the shipment dialog was free text hinting "UPS, USPS, FedEx, BlueDart" — two
 * vocabularies for one field. This is the one list; keep all three inputs on it.
 */
export const CARRIER_SUGGESTIONS = [
  "Shiprocket",
  "Delhivery",
  "Blue Dart",
  "DTDC",
  "Ecom Express",
  "India Post",
  "XpressBees",
  "FedEx",
  "DHL",
  "UPS",
] as const;
