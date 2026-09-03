import { normalizeShopifyOptions } from './product-options.util';

/**
 * The shape that goes into `Product.options` — and therefore the shape the
 * client reads back and re-posts. Both failure directions are silent: keep an
 * extra key and every save of a multi-variant product 400s; drop a real one and
 * the option editor loses data.
 */
describe('normalizeShopifyOptions', () => {
  // As the products/update webhook delivers it (REST).
  const REST_OPTION = {
    id: 1020,
    product_id: 632910392,
    name: 'Size',
    position: 1,
    values: ['S', 'M', 'L'],
  };
  // As the Sync button delivers it (GraphQL, already bridged).
  const GRAPHQL_OPTION = { name: 'Size', values: ['S', 'M', 'L'], position: 1 };

  describe('the reported bug: REST ids leaking into storage', () => {
    it('strips id and product_id from a webhook option', () => {
      expect(normalizeShopifyOptions([REST_OPTION])).toEqual([GRAPHQL_OPTION]);
    });

    it('stores exactly the three whitelisted keys and no others', () => {
      const [stored] = normalizeShopifyOptions([REST_OPTION])!;
      expect(Object.keys(stored).sort()).toEqual(['name', 'position', 'values']);
    });

    it('produces the same shape from either door', () => {
      expect(normalizeShopifyOptions([REST_OPTION])).toEqual(
        normalizeShopifyOptions([GRAPHQL_OPTION]),
      );
    });
  });

  describe('existing behaviour that must survive', () => {
    it("stores null for Shopify's Title / Default Title placeholder", () => {
      expect(
        normalizeShopifyOptions([
          { id: 1, name: 'Title', position: 1, values: ['Default Title'] },
        ]),
      ).toBeNull();
    });

    it('does not mistake a real single option named Title for the placeholder', () => {
      expect(
        normalizeShopifyOptions([{ name: 'Title', values: ['Red', 'Blue'] }]),
      ).toHaveLength(1);
    });

    it('keeps position when the payload supplies it', () => {
      const out = normalizeShopifyOptions([
        { name: 'Colour', values: ['Red'], position: 2 },
        { name: 'Size', values: ['S'], position: 1 },
      ])!;
      expect(out.map((o) => o.position)).toEqual([2, 1]);
    });

    it('preserves option order and value order', () => {
      const out = normalizeShopifyOptions([
        { name: 'Colour', values: ['Red', 'Blue'] },
        { name: 'Size', values: ['L', 'S'] },
      ])!;
      expect(out.map((o) => o.name)).toEqual(['Colour', 'Size']);
      expect(out[1].values).toEqual(['L', 'S']);
    });
  });

  describe('degenerate input', () => {
    it('returns null for absent or empty options', () => {
      expect(normalizeShopifyOptions(undefined)).toBeNull();
      expect(normalizeShopifyOptions(null)).toBeNull();
      expect(normalizeShopifyOptions([])).toBeNull();
      expect(normalizeShopifyOptions('not an array')).toBeNull();
    });

    it('falls back to array order when position is missing', () => {
      const out = normalizeShopifyOptions([
        { name: 'A', values: ['x'] },
        { name: 'B', values: ['y'] },
      ])!;
      expect(out.map((o) => o.position)).toEqual([1, 2]);
    });

    it('tolerates malformed entries without throwing', () => {
      const out = normalizeShopifyOptions([null, { values: 'nope' }, { name: 7 }])!;
      expect(out).toEqual([
        { name: '', values: [], position: 1 },
        { name: '', values: [], position: 2 },
        { name: '', values: [], position: 3 },
      ]);
    });

    it('drops non-string values', () => {
      const [out] = normalizeShopifyOptions([{ name: 'A', values: ['x', 3, null] }])!;
      expect(out.values).toEqual(['x']);
    });
  });
});
