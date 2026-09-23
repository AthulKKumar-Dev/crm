import type { ProductShopifySync } from "~/types/api";

/**
 * Shared "can this product be pushed to Shopify?" rules for the products list
 * row and the product page header, so the two sync buttons can't drift apart.
 */

type SyncSource = { channel?: { platform: string } | null };

/**
 * The sync action is hidden only for a Shopify-channel product that is fully
 * SYNCED (nothing to push). Everything else — never pushed, local edits
 * (OUT_OF_SYNC), a failed push, or a MANUAL product — can be synced. PENDING
 * is handled by the caller (a spinner, never a second enqueue).
 */
export function canSyncProduct(
  product: SyncSource,
  sync: Pick<ProductShopifySync, "status"> | null | undefined,
): boolean {
  return sync?.status !== "SYNCED" || product.channel?.platform !== "SHOPIFY";
}

/** Tooltip for the sync action, matching the state it will act on. */
export function productSyncActionTitle(
  sync: Pick<ProductShopifySync, "status"> | null | undefined,
): string {
  if (sync?.status === "FAILED") return "Retry sync to Shopify";
  if (sync?.status === "OUT_OF_SYNC") return "Push local edits to Shopify";
  return "Sync to Shopify";
}
