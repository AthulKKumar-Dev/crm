/**
 * Comparing the scopes Shopify actually granted a store against the ones this
 * app asks for.
 *
 * Both halves of that are subtler than they look, and getting either wrong
 * makes the check worthless:
 *
 *  - Shopify does not echo the list we requested. `write_X` implies `read_X`
 *    and only the write scope is reported back, so a naive set-difference
 *    reports `read_orders` "missing" on a store that reads orders perfectly
 *    well. Measured against the live dev data, that false-positives on every
 *    healthy store — and a check that cries wolf is a check nobody reads.
 *  - A store connected before we started recording the grant has no list at
 *    all. Unknown is not the same as missing, and reporting those as broken
 *    would be the same failure in a different costume.
 */

/**
 * The granted list, with each `write_X` expanded to also cover `read_X`.
 */
export function expandGrantedScopes(
  granted: string | null | undefined,
): Set<string> {
  const set = new Set<string>();
  for (const raw of String(granted ?? '').split(',')) {
    const scope = raw.trim();
    if (!scope) continue;
    set.add(scope);
    if (scope.startsWith('write_')) {
      set.add(`read_${scope.slice('write_'.length)}`);
    }
  }
  return set;
}

/**
 * Scopes this app requires that the store has not granted.
 *
 * Returns `[]` when the grant is unknown — see the note above.
 *
 * `read_all_orders` is deliberately NOT implied by `write_orders` (Shopify
 * treats it as a separate protected scope), so a store capped at 60 days of
 * order history is correctly reported here rather than looking healthy.
 */
export function missingScopes(
  required: string,
  granted: string | null | undefined,
): string[] {
  if (!granted) return [];
  const have = expandGrantedScopes(granted);
  return required
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope) => scope && !have.has(scope));
}

export interface ShopifyScopeStatus {
  /** False when the channel predates us recording the grant. */
  known: boolean;
  missing: string[];
  /** True only when we know the grant AND it is short of what we need. */
  reconnectRequired: boolean;
}
