/**
 * Work out which LOCAL order lines a Shopify fulfilment covers, and what that
 * implies for those lines.
 *
 * Why this exists: `OrderFulfillment.metadata.lineItemIds` is the ONLY link
 * between a shipment and the lines it ships. `buildLineTrackingMap` and
 * `resolveFulfillmentForLine` both read nothing else. The CRM writes it when it
 * creates a fulfilment, but the Shopify sync never did — so for every order
 * fulfilled in Shopify:
 *
 *   - per-line tracking was always null in the read model, and
 *   - "Add tracking" on a line 400'd with "Fulfil this item before adding
 *     tracking", because no fulfilment could be resolved for it.
 *
 * The pull is worse still: the GraphQL order query deliberately omits per-line
 * `fulfillment_status`, and nothing anywhere writes `fulfilledQuantity` for a
 * Shopify order. So a fully-shipped Shopify order arrived with every line
 * reading unfulfilled, and the UI grouped them all under "Unfulfilled" with no
 * actions. Hence `linePatches`: the same pass that records membership also
 * writes back what actually shipped.
 *
 * Pure and exported so the mapping can be asserted directly — the same reason
 * `order-rebadge.util.ts` is shaped this way.
 */

/** One fulfilment as it reaches us, from either ingestion path. */
export interface ShopifyFulfilmentShape {
  /** Shopify's fulfilment id, already reduced to its numeric form. */
  externalId: string;
  /** Shopify's status, any case. `cancelled`/`error`/`failure` contribute nothing. */
  status: string | null;
  /** The Shopify LINE ids this shipment covers, with quantities. */
  lines: Array<{ shopifyLineId: string; quantity: number }>;
}

export interface LocalLineShape {
  id: string;
  /** The Shopify line id this local row mirrors. */
  externalId: string | null;
  quantity: number;
  fulfillmentStatus: string | null;
  fulfilledQuantity: number;
}

export interface FulfilmentLineMapResult {
  /** fulfilment externalId → local line ids it ships. */
  lineItemIdsByExternalId: Map<string, string[]>;
  /** Line rows whose shipped count or status needs correcting. */
  linePatches: Array<{
    id: string;
    fulfilledQuantity: number;
    fulfillmentStatus: string | null;
  }>;
}

/** A fulfilment in one of these states ships nothing. */
function contributesUnits(status: string | null): boolean {
  const key = (status ?? '').toLowerCase();
  return key !== 'cancelled' && key !== 'canceled' && key !== 'error' && key !== 'failure';
}

/**
 * Same three-way rule as `OrderService.statusForFulfilledQuantity`, including
 * its "never downgrade a delivered line" clause — a shipment marked delivered
 * in the CRM must not be walked back to merely fulfilled by a later pull.
 */
export function statusForShippedUnits(
  shipped: number,
  ordered: number,
  previous: string | null,
): string | null {
  if (shipped <= 0) return previous === 'delivered' ? previous : null;
  if (shipped >= ordered) return previous === 'delivered' ? 'delivered' : 'fulfilled';
  return 'partial';
}

/**
 * @param fulfilments        shipments from the payload
 * @param localLines         this order's line rows
 * @param existingIdsByExternalId  ids already recorded on each fulfilment, so a
 *   partial mapping recorded earlier (the one-line-at-a-time backfill) is
 *   widened rather than replaced
 */
export function mapFulfilmentLines(
  fulfilments: ShopifyFulfilmentShape[],
  localLines: LocalLineShape[],
  existingIdsByExternalId: Map<string, string[]> = new Map(),
): FulfilmentLineMapResult {
  const localByExternalId = new Map<string, LocalLineShape>();
  for (const li of localLines) {
    if (li.externalId) localByExternalId.set(li.externalId, li);
  }

  const lineItemIdsByExternalId = new Map<string, string[]>();
  const shippedByLocalId = new Map<string, number>();

  for (const ff of fulfilments) {
    const covered: string[] = [];
    for (const fl of ff.lines) {
      const local = localByExternalId.get(fl.shopifyLineId);
      // A Shopify line we hold no row for is skipped, not fatal: line items are
      // paged and reconciled separately, so a transient gap must not abort the
      // whole mapping.
      if (!local) continue;
      covered.push(local.id);
      if (contributesUnits(ff.status)) {
        const units = Number.isFinite(fl.quantity) ? Math.max(fl.quantity, 0) : 0;
        shippedByLocalId.set(local.id, (shippedByLocalId.get(local.id) ?? 0) + units);
      }
    }
    // Union with what was already recorded. Overwriting is what kept the
    // lazily-backfilled array a permanent subset of the shipment's contents.
    const union = new Set([...(existingIdsByExternalId.get(ff.externalId) ?? []), ...covered]);
    if (union.size > 0) lineItemIdsByExternalId.set(ff.externalId, [...union]);
  }

  const linePatches: FulfilmentLineMapResult['linePatches'] = [];
  for (const li of localLines) {
    const shipped = Math.min(shippedByLocalId.get(li.id) ?? 0, li.quantity);
    // Only lines this payload actually said something about. A line no
    // fulfilment mentions is left alone rather than being zeroed — the payload
    // is not proof that nothing shipped.
    if (!shippedByLocalId.has(li.id)) continue;
    const status = statusForShippedUnits(shipped, li.quantity, li.fulfillmentStatus);
    if (shipped === li.fulfilledQuantity && status === li.fulfillmentStatus) continue;
    linePatches.push({ id: li.id, fulfilledQuantity: shipped, fulfillmentStatus: status });
  }

  return { lineItemIdsByExternalId, linePatches };
}

/**
 * Units shipped on a line, from whichever shipping signal the payload carried.
 *
 * `fulfillable_quantity` is what is LEFT to ship, supplied by REST webhooks and
 * (since this change) mapped from `unfulfilledQuantity` on the GraphQL pull.
 * `fulfillment_status` is the older REST-only flat field. Returns null when the
 * payload said nothing, so the caller leaves the stored values alone rather
 * than asserting that nothing shipped.
 */
export function shippedFromPayload(li: {
  quantity: number;
  fulfillable_quantity?: unknown;
  fulfillment_status?: unknown;
}): number | null {
  const remaining = Number(li.fulfillable_quantity);
  if (li.fulfillable_quantity !== undefined && li.fulfillable_quantity !== null && Number.isFinite(remaining)) {
    return Math.max(Math.min(li.quantity - remaining, li.quantity), 0);
  }
  const status = typeof li.fulfillment_status === 'string' ? li.fulfillment_status : null;
  if (status === 'fulfilled') return li.quantity;
  return null;
}

/**
 * Whether a fulfilment status arriving from Shopify should overwrite the one
 * held locally.
 *
 * The sync used to overwrite unconditionally, so a shipment the merchant marked
 * delivered in the CRM reverted to Shopify's `success` on the very next pull —
 * taking the delivered state, and the correctness of every "is this delivered"
 * check, with it. Shopify has no concept of delivered here, so its `success`
 * carries strictly less information than our `delivered` and must not win.
 * A cancellation still does: that IS new information.
 */
export function shouldAcceptRemoteFulfilmentStatus(
  local: string | null | undefined,
  incoming: string | null | undefined,
): boolean {
  if ((local ?? '').toLowerCase() !== 'delivered') return true;
  const next = (incoming ?? '').toLowerCase();
  return next === 'cancelled' || next === 'canceled' || next === 'delivered';
}
