/**
 * Identity of a product image, independent of which Shopify API returned it.
 *
 * Extracted from `ShopifySyncService.upsertProduct` so the rule can be tested
 * without standing up Prisma — it is the whole fix for the duplicate-image bug
 * and its failure mode is silent.
 *
 * Shopify hands us two different ids for the SAME photo depending on which door
 * the payload came through:
 *   - the manual Sync pulls over GraphQL, whose media nodes are MediaImage ids;
 *   - the products/update webhook posts a REST body, whose images carry legacy
 *     ProductImage ids.
 * Those are different numbers, so `ProductImage`'s (productId, externalId)
 * unique could not collapse them and each image accumulated one row per
 * namespace — rendering twice in the gallery.
 *
 * The CDN path is the one identifier both APIs agree on: it belongs to the
 * stored asset, not to the caller.
 *
 * The query string is dropped. `?v=` is a cache-buster stamped from the asset's
 * updated_at, so it differs between callers and changes whenever the file is
 * re-saved; transform params (width, crop) differ per request too.
 *
 * Path only, never the origin: a store may serve the same file from
 * cdn.shopify.com or from its own domain. Comparisons are always scoped to a
 * single product, so the path alone is specific enough.
 */
export function imageSrcKey(src: string | null | undefined): string {
  if (!src) return '';
  try {
    return new URL(src).pathname.toLowerCase();
  } catch {
    // Relative or malformed URL (CRM-hosted uploads are stored as paths).
    return src.split('?')[0].toLowerCase();
  }
}

/**
 * Was this image row uploaded through the CRM rather than pulled from Shopify?
 *
 * `ProductService.addImage` mints `manual_<uuid>` externalIds. Shopify has
 * never heard of those files, so a reconcile driven by a Shopify payload must
 * never prune them for being absent from it.
 */
export function isManualImage(externalId: string | null | undefined): boolean {
  return !!externalId && externalId.startsWith('manual_');
}

/** The subset of a stored `ProductImage` row the reconcile needs. */
export interface StoredImage {
  id: string;
  externalId: string;
  src: string;
}

/** One image as it arrives in a Shopify payload, already normalised. */
export interface PlannedWrite {
  /** Row to update, or `null` to insert a new one. */
  updateId: string | null;
  externalId: string;
  src: string;
  /** Passed through: `undefined` means "leave the column alone" in Prisma. */
  alt: string | null | undefined;
  position: number;
}

export interface ImageReconcilePlan {
  /**
   * Rows to delete, each carrying the row that variants pointing at it should
   * move to (`null` clears the association).
   */
  doomed: Array<{ id: string; repointTo: string | null }>;
  writes: PlannedWrite[];
}

/**
 * Decide what to delete, repoint and write so a product's stored images match a
 * Shopify payload. Pure: the caller performs the writes.
 *
 * Split out from `ShopifySyncService` because this is the whole substance of
 * the duplicate-image fix, and standing the service up in a test would mean
 * mocking a dozen injected dependencies. The Prisma side is then a thin
 * executor with nothing left to get wrong except the order it applies the plan
 * in, which `reconcileProductImages` documents.
 *
 * Matching is by CDN path (`imageSrcKey`), never by Shopify id — see that
 * function for why the id cannot be trusted.
 *
 * @param existing Stored rows, OLDEST FIRST. Order is load-bearing: the oldest
 * row for a path is the survivor, because that is the one `variant.imageId`
 * already points at, so most variant links stay intact for free.
 * @param rawImages The payload's `images` array, untrusted.
 */
export function planImageReconcile(
  existing: StoredImage[],
  rawImages: unknown,
): ImageReconcilePlan {
  const hasList = Array.isArray(rawImages);
  const list: any[] = hasList ? (rawImages as any[]) : [];

  // De-dupe the payload against itself; first occurrence wins.
  const incoming: Array<{
    externalId: string;
    src: string;
    srcKey: string;
    alt: string | null | undefined;
    position: number;
  }> = [];
  const seenKeys = new Set<string>();
  list.forEach((si, i) => {
    const srcKey = imageSrcKey(si?.src);
    if (!srcKey || seenKeys.has(srcKey)) return;
    seenKeys.add(srcKey);
    incoming.push({
      externalId: String(si.id),
      src: si.src,
      srcKey,
      alt: si.alt,
      position: si.position ?? i + 1,
    });
  });

  const survivorByKey = new Map<string, StoredImage>();
  for (const row of existing) {
    const key = imageSrcKey(row.src);
    if (key && !survivorByKey.has(key)) survivorByKey.set(key, row);
  }

  const incomingKeys = new Set(incoming.map((img) => img.srcKey));
  // Prune images Shopify no longer lists ONLY when the payload actually carried
  // a non-empty array. A payload that omits `images` must never be read as
  // "the merchant deleted everything".
  const mayPruneAbsent = hasList && incoming.length > 0;

  const doomedRows = existing.filter((row) => {
    // CRM-uploaded images are invisible to Shopify — never prune them.
    if (isManualImage(row.externalId)) return false;
    const key = imageSrcKey(row.src);
    const survivor = survivorByKey.get(key);
    if (survivor && survivor.id !== row.id) return true; // duplicate copy
    return mayPruneAbsent && !incomingKeys.has(key); // gone from Shopify
  });
  const doomedIds = new Set(doomedRows.map((row) => row.id));

  const doomed = doomedRows.map((row) => {
    // Move variants onto the surviving row — unless the survivor is itself
    // being deleted (Shopify dropped that image entirely), leaving nothing to
    // point at.
    const survivor = survivorByKey.get(imageSrcKey(row.src));
    const repointTo =
      survivor && survivor.id !== row.id && !doomedIds.has(survivor.id)
        ? survivor.id
        : null;
    return { id: row.id, repointTo };
  });

  const writes = incoming.map((img) => {
    const survivor = survivorByKey.get(img.srcKey);
    return {
      updateId: survivor && !doomedIds.has(survivor.id) ? survivor.id : null,
      externalId: img.externalId,
      src: img.src,
      alt: img.alt,
      position: img.position,
    };
  });

  return { doomed, writes };
}
