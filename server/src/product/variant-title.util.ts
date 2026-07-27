/**
 * Shopify convention: a single-variant product's variant is titled
 * "Default Title" (and option1 = "Default Title"). We store it identically
 * so pushes round-trip cleanly, but it must never be shown to users or
 * snapshotted into order records. Use displayVariantTitle() at those
 * boundaries.
 */
export const DEFAULT_VARIANT_TITLE = 'Default Title';

/** Human-facing variant title: null for the sentinel so callers can omit it. */
export function displayVariantTitle(
  title: string | null | undefined,
): string | null {
  if (!title || title === DEFAULT_VARIANT_TITLE) return null;
  return title;
}
