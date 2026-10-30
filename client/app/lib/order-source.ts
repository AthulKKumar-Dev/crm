import type { Order } from "~/types/api";

type OrderSourceInput = Partial<
  Pick<Order, "channel" | "metadata" | "sourceName" | "sourceLabel">
>;

/** The marker `pushOrder` stamps on an order this CRM created in Shopify. */
const CRM_SOURCE_NAME = "collabo-crm";

/**
 * Shopify's raw source codes. Only consulted until a sync pull stores Shopify's
 * own display name — webhooks carry the code but not the name.
 */
const SOURCE_CODE_LABEL: Record<string, string> = {
  web: "Online Store",
  pos: "POS",
  shopify_draft_order: "Draft order",
};

/**
 * Where an order was created: "Collabo", "Online Store", "Point of Sale", …
 *
 * Null when nothing is known — an order not synced since the source columns
 * were introduced — so callers fall back to the plain channel label.
 */
export function orderSourceLabel(order: OrderSourceInput): string | null {
  const meta = order.metadata as { source?: string } | null | undefined;
  if (
    order.channel?.platform === "MANUAL" ||
    meta?.source === "offline" ||
    order.sourceName === CRM_SOURCE_NAME
  ) {
    return "Collabo";
  }
  if (order.sourceLabel) return order.sourceLabel;
  if (!order.sourceName) return null;
  return SOURCE_CODE_LABEL[order.sourceName] ?? "Shopify";
}
