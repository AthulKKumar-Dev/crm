/**
 * Product options as `Product.options` stores them: exactly the three keys
 * `ProductOptionDto` accepts back, and nothing else.
 *
 * Extracted from `ShopifySyncService.upsertProduct` so the rule can be tested
 * without Prisma, and so BOTH doors into that method share one definition. The
 * Sync button (GraphQL, via `transformGraphqlProduct`) already mapped options
 * down to {name, values, position}; the products/update webhook handed the raw
 * REST body through untouched, and Shopify's REST options carry `id` and
 * `product_id`. Those were stored verbatim, returned to the client verbatim,
 * and rejected verbatim by the validation whitelist when the client posted them
 * back — "options.0.property id should not exist" on every save of a product
 * with variants that had been through a webhook.
 *
 * A type alias rather than an interface on purpose: Prisma's `InputJsonValue`
 * needs an implicit index signature, which interfaces do not get.
 */
export type StoredProductOption = {
  name: string;
  values: string[];
  position: number;
};

/**
 * Shopify signals "no real options" with a placeholder option named "Title"
 * whose only value is "Default Title". We store null instead — the convention
 * for single-variant products — so the UI never renders a fake "Title" option.
 * (The CSV importer already filters this; the pull path must match.)
 */
function isPlaceholderOptions(options: unknown[]): boolean {
  if (options.length !== 1) return false;
  const only = options[0] as { name?: unknown; values?: unknown } | null;
  return (
    only?.name === 'Title' &&
    Array.isArray(only.values) &&
    only.values.length === 1 &&
    only.values[0] === 'Default Title'
  );
}

/**
 * @param raw The payload's `options`, untrusted — REST or GraphQL-bridged.
 * @returns `null` when there is nothing real to store (absent, empty, or the
 * placeholder), so the column keeps its existing semantics.
 */
export function normalizeShopifyOptions(
  raw: unknown,
): StoredProductOption[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (isPlaceholderOptions(raw)) return null;

  return raw.map((entry, i) => {
    const o = (entry ?? {}) as {
      name?: unknown;
      values?: unknown;
      position?: unknown;
    };
    return {
      name: typeof o.name === 'string' ? o.name : '',
      values: Array.isArray(o.values)
        ? o.values.filter((v): v is string => typeof v === 'string')
        : [],
      // REST and the GraphQL bridge both send position; fall back to array
      // order for anything that doesn't.
      position: typeof o.position === 'number' ? o.position : i + 1,
    };
  });
}
