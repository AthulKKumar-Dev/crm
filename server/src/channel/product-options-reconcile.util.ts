/**
 * Diff the CRM's option structure against a Shopify product's live options and
 * plan the mutations that make Shopify match.
 *
 * Extracted from `ShopifyPushService.pushProductUpdate` so the rule can be
 * tested without Prisma or a store. The bug it exists for was silent: the
 * update path pushed variants that referenced an option Shopify had never been
 * told about, Shopify rejected them, the rejection was logged and swallowed,
 * and the product was stamped SYNCED anyway.
 *
 * Options are matched by exact name, the same rule `ProductService.updateOptions`
 * uses for its slot map — so a rename in the CRM is a delete + create here,
 * exactly as it already was for the CRM's own variant columns.
 *
 * Shopify's placeholder for "no options" is a single option named `Title` with
 * the single value `Default Title`. The CRM stores `null` for that case, so the
 * placeholder is treated as an empty remote list; the caller is responsible
 * for removing the placeholder if Shopify leaves it behind after a create.
 *
 * Deliberately NOT planned:
 *   - option-VALUE removals (deleting a value Shopify still has variants for
 *     would delete those variants);
 *   - per-variant option reassignment (that is variant data, not structure).
 */

export interface LocalOption {
  name: string;
  values: string[];
}

export interface RemoteOption {
  /** `gid://shopify/ProductOption/…` */
  id: string;
  name: string;
  position: number;
  values: string[];
}

export interface OptionReconcilePlan {
  /** Remote option ids that no longer exist locally → `productOptionsDelete`. */
  toDelete: string[];
  /** Local options Shopify does not have → `productOptionsCreate`. Local order. */
  toCreate: Array<{ name: string; values: Array<{ name: string }> }>;
  /** Shared options whose local value list has entries Shopify lacks → `productOptionUpdate`. */
  valuesToAdd: Array<{
    optionId: string;
    optionName: string;
    values: Array<{ name: string }>;
  }>;
  /**
   * Full local name order for `productOptionsReorder`, or `null` when the
   * order Shopify will have after delete + create already matches. Names, not
   * ids, because freshly created options have no id yet at planning time.
   */
  reorder: Array<{ name: string }> | null;
  /** Remote was exactly the `Title` / `Default Title` placeholder. */
  remoteIsPlaceholder: boolean;
}

export function isPlaceholderRemoteOptions(remote: RemoteOption[]): boolean {
  return (
    remote.length === 1 &&
    remote[0].name === 'Title' &&
    remote[0].values.length === 1 &&
    remote[0].values[0] === 'Default Title'
  );
}

export function planOptionReconcile(
  local: LocalOption[],
  remote: RemoteOption[],
): OptionReconcilePlan {
  const remoteIsPlaceholder = isPlaceholderRemoteOptions(remote);
  const effectiveRemote = remoteIsPlaceholder
    ? []
    : [...remote].sort((a, b) => a.position - b.position);

  const localNames = local.map((o) => o.name);
  const remoteByName = new Map(effectiveRemote.map((o) => [o.name, o]));

  const toDelete = effectiveRemote
    .filter((o) => !localNames.includes(o.name))
    .map((o) => o.id);

  const toCreate = local
    .filter((o) => !remoteByName.has(o.name))
    .map((o) => ({ name: o.name, values: o.values.map((v) => ({ name: v })) }));

  const valuesToAdd: OptionReconcilePlan['valuesToAdd'] = [];
  for (const o of local) {
    const r = remoteByName.get(o.name);
    if (!r) continue;
    const missing = o.values.filter((v) => !r.values.includes(v));
    if (missing.length > 0) {
      valuesToAdd.push({
        optionId: r.id,
        optionName: o.name,
        values: missing.map((v) => ({ name: v })),
      });
    }
  }

  // Order Shopify will have once deletes are applied and creates are appended:
  // survivors in their current remote order, then the new ones in local order.
  const survivors = effectiveRemote
    .filter((o) => localNames.includes(o.name))
    .map((o) => o.name);
  const afterCreate = [...survivors, ...toCreate.map((o) => o.name)];
  const orderMatches =
    afterCreate.length === localNames.length &&
    afterCreate.every((name, i) => name === localNames[i]);
  const reorder =
    orderMatches || localNames.length === 0
      ? null
      : localNames.map((name) => ({ name }));

  return { toDelete, toCreate, valuesToAdd, reorder, remoteIsPlaceholder };
}

export function isNoopPlan(plan: OptionReconcilePlan): boolean {
  return (
    plan.toDelete.length === 0 &&
    plan.toCreate.length === 0 &&
    plan.valuesToAdd.length === 0 &&
    plan.reorder === null
  );
}
