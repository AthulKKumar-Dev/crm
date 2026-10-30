import {
  lowStockVariantRows,
  toLowStockEntry,
  type LowStockSourceProduct,
} from './low-stock.util';

const variant = (id: string, title: string | null, stock: number, sku: string | null = null) => ({
  id,
  title,
  sku,
  price: '599.00',
  inventoryQuantity: stock,
});

const product = (variants: LowStockSourceProduct['variants']): LowStockSourceProduct => ({
  id: 'p1',
  title: 'Screw nagas bangles',
  images: [{ src: 'https://cdn/img.jpg' }],
  variants,
});

describe('toLowStockEntry', () => {
  it('names only the variant that is low, not the whole product', () => {
    const entry = toLowStockEntry(
      product([variant('a', '2.4', 18), variant('b', '2.6', 10), variant('c', '2.8', 0, 'SJ1125C')]),
      5,
    );

    expect(entry.lowVariants).toEqual([{ id: 'c', title: '2.8', sku: 'SJ1125C', stock: 0 }]);
    expect(entry.lowVariantCount).toBe(1);
    expect(entry.variantCount).toBe(3);
    // Product-level figures are unchanged.
    expect(entry.currentStock).toBe(28);
    expect(entry.lowestVariantStock).toBe(0);
  });

  it('lists several low variants, lowest stock first', () => {
    const entry = toLowStockEntry(
      product([variant('a', '2.4', 3), variant('b', '2.6', 20), variant('c', '2.8', 0), variant('d', '3.0', 10)]),
      10,
    );

    expect(entry.lowVariants.map((v) => [v.title, v.stock])).toEqual([
      ['2.8', 0],
      ['2.4', 3],
      ['3.0', 10],
    ]);
    expect(entry.lowVariantCount).toBe(3);
  });

  it('hides the "Default Title" of a single-variant product', () => {
    const entry = toLowStockEntry(product([variant('a', 'Default Title', 4)]), 10);

    expect(entry.lowVariants).toEqual([{ id: 'a', title: null, sku: null, stock: 4 }]);
  });

  describe('lowStockVariantRows', () => {
    const bangles = toLowStockEntry(
      product([variant('a', '2.4', 7), variant('b', '2.6', 18), variant('c', '2.8', 0, 'SJ1125C')]),
      10,
    );
    const hangings = toLowStockEntry(
      { ...product([variant('h', 'Default Title', 3, 'SJ1088')]), id: 'p2', title: 'Aishwarya hangings' },
      10,
    );

    it('lists one row per low variant, naming the variant', () => {
      expect(lowStockVariantRows([bangles], 5)).toEqual([
        expect.objectContaining({ productTitle: 'Screw nagas bangles', variantTitle: '2.8', sku: 'SJ1125C', stock: 0 }),
        expect.objectContaining({ productTitle: 'Screw nagas bangles', variantTitle: '2.4', stock: 7 }),
      ]);
    });

    it('ranks variants across products, most urgent first', () => {
      const rows = lowStockVariantRows([bangles, hangings], 5);
      expect(rows.map((r) => [r.productTitle, r.variantTitle, r.stock])).toEqual([
        ['Screw nagas bangles', '2.8', 0],
        ['Aishwarya hangings', null, 3],
        ['Screw nagas bangles', '2.4', 7],
      ]);
    });

    it('caps at the limit', () => {
      expect(lowStockVariantRows([bangles, hangings], 2)).toHaveLength(2);
    });
  });

  it('keeps the existing fields', () => {
    const entry = toLowStockEntry(product([variant('a', '2.4', 1)]), 10);

    expect(entry).toMatchObject({
      id: 'p1',
      title: 'Screw nagas bangles',
      image: 'https://cdn/img.jpg',
      price: '599.00',
      threshold: 10,
    });
  });
});
