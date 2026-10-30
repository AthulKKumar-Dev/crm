import {
  SHOPIFY_VARIANT_PAGE_CAP,
  planVariantPrune,
  type PrunableVariant,
} from './shopify-variant-prune.util';

/**
 * The regression: Shopify replaced a product's default variant a second after
 * creating it (…197946 ₹0 → …984378 ₹799), and the CRM kept both. 377 such
 * ghosts across 372 products on prod (Shrishti J, 2026-09-30).
 */

const created = (iso: string) => new Date(iso);

const ghost: PrunableVariant = {
  id: 'v_ghost',
  externalId: '50476855197946',
  createdAt: created('2026-09-21T05:09:55.395Z'),
};
const live: PrunableVariant = {
  id: 'v_live',
  externalId: '50476855984378',
  createdAt: created('2026-09-21T05:09:56.433Z'),
};

const payload = (over: Partial<{ updated_at: string | null; variants: Array<{ id: string | number }> | null }> = {}) => ({
  updated_at: '2026-09-30T08:48:47Z',
  variants: [{ id: 50476855984378 }],
  ...over,
});

describe('planVariantPrune', () => {
  it('removes a variant Shopify replaced', () => {
    expect(planVariantPrune([ghost, live], payload())).toEqual([ghost]);
  });

  it('keeps every variant Shopify still has, matching numeric ids to string ones', () => {
    expect(planVariantPrune([live], payload())).toEqual([]);
  });

  it('never touches a CRM-created variant that has no Shopify id yet', () => {
    const local: PrunableVariant = { id: 'v_local', externalId: null, createdAt: created('2026-09-01T00:00:00Z') };
    expect(planVariantPrune([local, live], payload())).toEqual([]);
  });

  it('does not trust an empty variant list', () => {
    expect(planVariantPrune([ghost, live], payload({ variants: [] }))).toEqual([]);
    expect(planVariantPrune([ghost, live], payload({ variants: null }))).toEqual([]);
  });

  it('skips a list that may be a truncated first page', () => {
    const full = Array.from({ length: SHOPIFY_VARIANT_PAGE_CAP }, (_, i) => ({ id: `x${i}` }));
    expect(planVariantPrune([ghost], payload({ variants: full }))).toEqual([]);

    const under = full.slice(1);
    expect(planVariantPrune([ghost], payload({ variants: under }))).toEqual([ghost]);
  });

  it('does not let an older, out-of-order payload delete a newer variant', () => {
    // Payload generated before the variant was created locally.
    const stale = payload({ updated_at: '2026-09-21T05:09:00Z' });
    expect(planVariantPrune([ghost, live], stale)).toEqual([]);
  });

  it('does nothing without a usable updated_at', () => {
    expect(planVariantPrune([ghost, live], payload({ updated_at: null }))).toEqual([]);
    expect(planVariantPrune([ghost, live], payload({ updated_at: 'not a date' }))).toEqual([]);
  });
});
