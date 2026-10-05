import { Prisma } from '@prisma/client';
import { mergeJsonMetadata } from '../common/utils/jsonb-merge.util';

/**
 * Location changes made to a variant in the CRM ("Edit locations") that
 * Shopify has not been told about yet. Kept on `Product.metadata` under its
 * own key — NOT inside `shopifySync`, which every status write replaces whole.
 *
 * They have to be remembered rather than worked out at push time by comparing
 * the two sides. "Shopify stocks it here and the CRM holds no row" is also
 * what a location looks like before its first pull, and "the CRM holds an
 * empty row Shopify does not stock" is also what is left behind when a
 * merchant un-stocks a location in Shopify admin. Acting on either would undo
 * something the merchant did on purpose, so only an explicit edit is pushed.
 */
export const PENDING_LOCATION_CHANGES_KEY = 'pendingLocationChanges';

export interface PendingLocationChange {
  variantId: string;
  warehouseId: string;
  shopifyLocationId: string;
  action: 'add' | 'remove';
}

export function readPendingLocationChanges(
  metadata: Prisma.JsonValue | null | undefined,
): PendingLocationChange[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const storedList = (metadata as Record<string, unknown>)[PENDING_LOCATION_CHANGES_KEY];
  if (!Array.isArray(storedList)) return [];
  // Metadata is free-form JSON, so anything not shaped like a change is dropped.
  return storedList.filter((entry): entry is PendingLocationChange => {
    if (!entry || typeof entry !== 'object') return false;
    const candidate = entry as PendingLocationChange;
    return (
      typeof candidate.variantId === 'string' &&
      typeof candidate.warehouseId === 'string' &&
      typeof candidate.shopifyLocationId === 'string' &&
      (candidate.action === 'add' || candidate.action === 'remove')
    );
  });
}

/**
 * Read-modify-write of the pending list under a row lock.
 *
 * Two writers touch this list — the merchant's edit and the push that clears
 * what it has applied — and an unlocked read-then-write lets the slower one
 * drop the other's entry: a removal recorded while a push was in flight would
 * be wiped when that push wrote back the list it had read earlier, and the
 * product would then report "synced" with Shopify still stocking the location.
 *
 * MUST be called inside a transaction, or the lock is released before the
 * write. Only this key is written, so a concurrent `shopifySync` status stamp
 * is never overwritten.
 */
export async function mutatePendingLocationChanges(
  tx: Prisma.TransactionClient,
  productId: string,
  organizationId: string,
  applyEdit: (currentChanges: PendingLocationChange[]) => PendingLocationChange[],
): Promise<PendingLocationChange[]> {
  const lockedProductRows = await tx.$queryRaw<Array<{ metadata: Prisma.JsonValue | null }>>`
    SELECT "metadata" FROM "products"
    WHERE "id" = ${productId} AND "organization_id" = ${organizationId}
    FOR UPDATE
  `;
  const currentChanges = readPendingLocationChanges(lockedProductRows[0]?.metadata);
  const updatedChanges = applyEdit(currentChanges);
  if (JSON.stringify(updatedChanges) !== JSON.stringify(currentChanges)) {
    await mergeJsonMetadata(tx, 'products', productId, organizationId, {
      [PENDING_LOCATION_CHANGES_KEY]: updatedChanges,
    });
  }
  return updatedChanges;
}
