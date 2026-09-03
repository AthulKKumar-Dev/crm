import {
  isNoopPlan,
  planOptionReconcile,
  RemoteOption,
} from './product-options-reconcile.util';

const gid = (n: number) => `gid://shopify/ProductOption/${n}`;

const remote = (
  ...opts: Array<[string, string[]]>
): RemoteOption[] =>
  opts.map(([name, values], i) => ({
    id: gid(i + 1),
    name,
    position: i + 1,
    values,
  }));

const PLACEHOLDER = remote(['Title', ['Default Title']]);

describe('planOptionReconcile', () => {
  it('is a no-op when local and remote already agree', () => {
    const plan = planOptionReconcile(
      [
        { name: 'Size', values: ['S', 'M'] },
        { name: 'Color', values: ['Red'] },
      ],
      remote(['Size', ['S', 'M']], ['Color', ['Red']]),
    );
    expect(isNoopPlan(plan)).toBe(true);
    expect(plan.remoteIsPlaceholder).toBe(false);
  });

  it('is a no-op when both sides have no real options', () => {
    expect(isNoopPlan(planOptionReconcile([], PLACEHOLDER))).toBe(true);
    expect(isNoopPlan(planOptionReconcile([], []))).toBe(true);
  });

  it('creates every local option on a Title-only (single-variant) product', () => {
    const plan = planOptionReconcile(
      [{ name: 'Size', values: ['S', 'M'] }],
      PLACEHOLDER,
    );
    expect(plan.remoteIsPlaceholder).toBe(true);
    // The placeholder is never planned for deletion — Shopify replaces it on
    // create, and the caller sweeps it if it survives.
    expect(plan.toDelete).toEqual([]);
    expect(plan.toCreate).toEqual([
      { name: 'Size', values: [{ name: 'S' }, { name: 'M' }] },
    ]);
    expect(plan.valuesToAdd).toEqual([]);
    expect(plan.reorder).toBeNull();
  });

  it('creates a third option added to a two-option product, values in CRM order', () => {
    const plan = planOptionReconcile(
      [
        { name: 'Size', values: ['S', 'M'] },
        { name: 'Color', values: ['Red'] },
        { name: 'Material', values: ['Cotton', 'Wool'] },
      ],
      remote(['Size', ['S', 'M']], ['Color', ['Red']]),
    );
    expect(plan.toCreate).toEqual([
      { name: 'Material', values: [{ name: 'Cotton' }, { name: 'Wool' }] },
    ]);
    expect(plan.toDelete).toEqual([]);
    expect(plan.valuesToAdd).toEqual([]);
    // Appended at the end already matches local order.
    expect(plan.reorder).toBeNull();
  });

  it('reorders when a new option is inserted before existing ones', () => {
    const plan = planOptionReconcile(
      [
        { name: 'Material', values: ['Cotton'] },
        { name: 'Size', values: ['S'] },
      ],
      remote(['Size', ['S']]),
    );
    expect(plan.toCreate.map((o) => o.name)).toEqual(['Material']);
    expect(plan.reorder).toEqual([{ name: 'Material' }, { name: 'Size' }]);
  });

  it('adds only the values Shopify is missing on a shared option', () => {
    const plan = planOptionReconcile(
      [{ name: 'Size', values: ['S', 'M', 'L'] }],
      remote(['Size', ['S', 'M']]),
    );
    expect(plan.valuesToAdd).toEqual([
      { optionId: gid(1), optionName: 'Size', values: [{ name: 'L' }] },
    ]);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it('never plans value removals', () => {
    const plan = planOptionReconcile(
      [{ name: 'Size', values: ['S'] }],
      remote(['Size', ['S', 'M']]),
    );
    expect(isNoopPlan(plan)).toBe(true);
  });

  it('deletes a remote option that was removed locally', () => {
    const plan = planOptionReconcile(
      [{ name: 'Size', values: ['S', 'M'] }],
      remote(['Size', ['S', 'M']], ['Color', ['Red']]),
    );
    expect(plan.toDelete).toEqual([gid(2)]);
    expect(plan.toCreate).toEqual([]);
    expect(plan.reorder).toBeNull();
  });

  it('deletes every remote option when the CRM has none left', () => {
    const plan = planOptionReconcile(
      [],
      remote(['Size', ['S', 'M']], ['Color', ['Red']]),
    );
    expect(plan.toDelete).toEqual([gid(1), gid(2)]);
    expect(plan.reorder).toBeNull();
  });

  it('treats a rename as delete + create (exact-name matching)', () => {
    const plan = planOptionReconcile(
      [{ name: 'Colour', values: ['Red'] }],
      remote(['Color', ['Red']]),
    );
    expect(plan.toDelete).toEqual([gid(1)]);
    expect(plan.toCreate).toEqual([{ name: 'Colour', values: [{ name: 'Red' }] }]);
  });

  it('reorders shared options when only their order changed', () => {
    const plan = planOptionReconcile(
      [
        { name: 'Color', values: ['Red'] },
        { name: 'Size', values: ['S'] },
      ],
      remote(['Size', ['S']], ['Color', ['Red']]),
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.toDelete).toEqual([]);
    expect(plan.reorder).toEqual([{ name: 'Color' }, { name: 'Size' }]);
  });

  it('uses remote position, not array order, to judge current order', () => {
    const plan = planOptionReconcile(
      [
        { name: 'Size', values: ['S'] },
        { name: 'Color', values: ['Red'] },
      ],
      [
        { id: gid(2), name: 'Color', position: 2, values: ['Red'] },
        { id: gid(1), name: 'Size', position: 1, values: ['S'] },
      ],
    );
    expect(isNoopPlan(plan)).toBe(true);
  });
});
