/**
 * Which local variants of a Shopify product no longer exist in Shopify.
 *
 * `upsertProduct` only upserts the variants a payload carries, so a variant
 * Shopify REPLACED (deleted + recreated) lived on locally forever. The common
 * case: a product is created with its default variant, and a second later the
 * merchant's price/SKU arrives as a brand-new variant id — leaving a ₹0,
 * SKU-less "Default Title" twin ("2 variants · ₹0.00 – ₹799.00") that also
 * poisons min-price figures such as the dashboard's Top Products revenue.
 *
 * Pure so the guards below are unit-tested; the service only executes it.
 * Pruning is destructive, so every guard errs towards keeping a row:
 *
 *  - Only rows that carry a Shopify id. A CRM-created variant not yet pushed
 *    has no externalId and is never touched.
 *  - Only when the payload's variant list is COMPLETE. The GraphQL pull fetches
 *    `variants(first: 100)` and REST payloads are capped at 100 too, so a list
 *    of 100 may be a truncated first page — skip rather than delete page two.
 *    An empty list is never trusted either: every Shopify product has at least
 *    one variant, so empty means the payload simply didn't include them.
 *  - Only rows created locally BEFORE the payload's `updated_at`. Webhooks can
 *    arrive out of order; a late, older payload must not delete a variant that
 *    was added after it was generated. No `updated_at` → no pruning.
 */

/** GraphQL `variants(first: 100)` page size; REST product payloads cap at 100 too. */
export const SHOPIFY_VARIANT_PAGE_CAP = 100;

export interface PrunableVariant {
  id: string;
  externalId: string | null;
  createdAt: Date;
}

export interface VariantPrunePayload {
  updated_at?: string | null;
  variants?: Array<{ id: string | number }> | null;
}

export function planVariantPrune(
  prior: PrunableVariant[],
  payload: VariantPrunePayload,
): PrunableVariant[] {
  const incoming = payload.variants ?? [];
  if (incoming.length === 0 || incoming.length >= SHOPIFY_VARIANT_PAGE_CAP) {
    return [];
  }

  const snapshotAt = payload.updated_at ? new Date(payload.updated_at) : null;
  if (!snapshotAt || Number.isNaN(snapshotAt.getTime())) return [];

  const live = new Set(incoming.map((v) => String(v.id)));
  return prior.filter(
    (v) =>
      v.externalId !== null &&
      !live.has(v.externalId) &&
      v.createdAt.getTime() < snapshotAt.getTime(),
  );
}
