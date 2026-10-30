/**
 * Thumbnails for the Analytics page's product lists.
 *
 * Those lists are built from `AnalyticsSnapshot.metrics.byProduct`, which were
 * written keyed by product TITLE only — the Shopify product id the pixel and
 * webhooks carry was dropped by both aggregators. They now keep it as
 * `productId`, but every snapshot written before that has none, so matching
 * falls back to the exact title. A title more than one product shares is
 * ambiguous and gets no image rather than a possibly wrong one.
 */

/** Numeric Shopify product id from a number, a numeric string or a GID. */
export function normalizeShopifyProductId(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  const id = value.startsWith('gid://') ? value.slice(value.lastIndexOf('/') + 1) : value;
  return /^\d+$/.test(id) ? id : null;
}

/** Record a title's Shopify product id — the first valid one seen wins. */
export function rememberProductId(
  byTitle: Map<string, string>,
  title: string,
  raw: unknown,
): void {
  if (byTitle.has(title)) return;
  const id = normalizeShopifyProductId(raw);
  if (id) byTitle.set(title, id);
}

export interface ProductImageCandidate {
  externalId: string | null;
  title: string;
  image: string | null;
}

export function attachProductImages<T extends { title: string; productId?: string | null }>(
  rows: T[],
  products: ProductImageCandidate[],
): Array<Omit<T, 'productId'> & { image: string | null }> {
  const byId = new Map<string, ProductImageCandidate>();
  const byTitle = new Map<string, ProductImageCandidate[]>();
  for (const p of products) {
    if (p.externalId) byId.set(p.externalId, p);
    byTitle.set(p.title, [...(byTitle.get(p.title) ?? []), p]);
  }

  return rows.map(({ productId, ...row }) => {
    const byExactId = productId ? byId.get(productId) : undefined;
    const sameTitle = byTitle.get(row.title) ?? [];
    const match = byExactId ?? (sameTitle.length === 1 ? sameTitle[0] : undefined);
    return { ...row, image: match?.image ?? null };
  });
}
