import { isStalePendingSync } from "~/lib/shopify-sync";
import type { ProductShopifySync } from "~/types/api";

/**
 * Shared "can this product be pushed to Shopify?" rules for the products list
 * row and the product page header, so the two sync buttons can't drift apart.
 */

type SyncSource = { channel?: { platform: string } | null };
type PushClaim = Pick<ProductShopifySync, "status" | "queuedAt"> | null | undefined;

/**
 * A push really is under way: PENDING, and claimed recently enough that a job
 * is still working on it. Only this state earns the spinner.
 */
export function isProductPushInFlight(sync: PushClaim): boolean {
  return sync?.status === "PENDING" && !isStalePendingSync(sync);
}

/**
 * PENDING, but nobody is working on it — the queue was down when it was
 * claimed, or the job was lost. It used to render as "Syncing" for ever with
 * no action; it is shown as stuck and can be retried instead.
 */
export function isProductPushStuck(sync: PushClaim): boolean {
  return isStalePendingSync(sync);
}

/**
 * The sync action is hidden only for a Shopify-channel product that is fully
 * SYNCED (nothing to push). Everything else — never pushed, local edits
 * (OUT_OF_SYNC), a failed push, a stuck one, or a MANUAL product — can be
 * synced. An in-flight push is handled by the caller (a spinner, never a
 * second enqueue).
 */
export function canSyncProduct(
  product: SyncSource,
  sync: Pick<ProductShopifySync, "status"> | null | undefined,
): boolean {
  return sync?.status !== "SYNCED" || product.channel?.platform !== "SHOPIFY";
}

/** Tooltip for the sync action, matching the state it will act on. */
export function productSyncActionTitle(sync: PushClaim): string {
  if (sync?.status === "FAILED") return "Retry sync to Shopify";
  if (isProductPushStuck(sync)) return "Sync stuck — retry";
  if (sync?.status === "OUT_OF_SYNC") return "Push local edits to Shopify";
  return "Sync to Shopify";
}
