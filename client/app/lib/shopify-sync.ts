import type { OrderShopifySync } from "~/types/api";

/**
 * Mirror of `STALE_PENDING_SYNC_MS` / `isStalePendingSync` on the server
 * (`server/src/channel/shopify-push.service.ts`). Keep the two in step: the
 * Sync action must reappear at the same moment the server would accept a
 * re-claim, or the merchant sees a button that returns "already in progress".
 */
export const STALE_PENDING_SYNC_MS = 15 * 60 * 1000;

export function isStalePendingSync(
  sync: Pick<OrderShopifySync, "status" | "queuedAt"> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (sync?.status !== "PENDING") return false;
  if (!sync.queuedAt) return true;
  const at = Date.parse(sync.queuedAt);
  return !Number.isFinite(at) || now - at > STALE_PENDING_SYNC_MS;
}

/**
 * Whether a MANUAL order can be (re)pushed to Shopify from the UI: never
 * pushed, the last push failed, or a PENDING claim that has clearly been
 * abandoned (queue was down, job evicted) and would otherwise dead-end the
 * order with no visible way out.
 */
export function canRetryShopifySync(
  sync: Pick<OrderShopifySync, "status" | "queuedAt"> | null | undefined,
  now: number = Date.now(),
): boolean {
  return !sync || sync.status === "FAILED" || isStalePendingSync(sync, now);
}

/** Label for the row / detail action given the current sync state. */
export function shopifySyncActionLabel(
  sync: Pick<OrderShopifySync, "status" | "queuedAt"> | null | undefined,
  now: number = Date.now(),
): string {
  if (sync?.status === "FAILED") return "Retry sync to Shopify";
  if (isStalePendingSync(sync, now)) return "Sync stuck — retry";
  return "Sync to Shopify";
}
