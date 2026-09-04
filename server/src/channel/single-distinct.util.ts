/**
 * The one distinct non-empty value in a list, or null.
 *
 * Used to decide where an order was dispatched from. Shopify can split an order
 * across several fulfilment locations; when it does, "the" dispatch warehouse is
 * not a question with one answer, and stamping the first one would put an
 * address on the invoice that only part of the shipment left from. Ambiguity
 * resolves to null — the invoice then falls back to the org default or prints
 * no dispatch block at all, which is honest.
 */
export function singleDistinct(
  values: ReadonlyArray<string | null | undefined>,
): string | null {
  const distinct = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) distinct.add(trimmed);
  }
  return distinct.size === 1 ? [...distinct][0] : null;
}
