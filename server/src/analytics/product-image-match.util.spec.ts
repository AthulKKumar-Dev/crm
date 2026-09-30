import {
  attachProductImages,
  normalizeShopifyProductId,
  type ProductImageCandidate,
} from './product-image-match.util';

const kemp: ProductImageCandidate = { externalId: '9462510911738', title: 'Kemp designer', image: 'https://cdn/kemp.jpg' };
const coralA: ProductImageCandidate = { externalId: '111', title: 'Coral bead mala', image: 'https://cdn/a.jpg' };
const coralB: ProductImageCandidate = { externalId: '222', title: 'Coral bead mala', image: 'https://cdn/b.jpg' };
const noImage: ProductImageCandidate = { externalId: '333', title: 'Plain chain', image: null };

describe('normalizeShopifyProductId', () => {
  it('accepts numbers, numeric strings and GIDs', () => {
    expect(normalizeShopifyProductId(9462510911738)).toBe('9462510911738');
    expect(normalizeShopifyProductId('9462510911738')).toBe('9462510911738');
    expect(normalizeShopifyProductId('gid://shopify/Product/9462510911738')).toBe('9462510911738');
  });

  it('rejects anything else', () => {
    expect(normalizeShopifyProductId(null)).toBeNull();
    expect(normalizeShopifyProductId('')).toBeNull();
    expect(normalizeShopifyProductId('not-an-id')).toBeNull();
  });
});

describe('attachProductImages', () => {
  const products = [kemp, coralA, coralB, noImage];

  it('matches on the product id when the row has one', () => {
    const [row] = attachProductImages([{ title: 'Coral bead mala', views: 4, productId: '222' }], products);
    expect(row).toEqual({ title: 'Coral bead mala', views: 4, image: 'https://cdn/b.jpg' });
  });

  it('falls back to the exact title for rows without an id', () => {
    const [row] = attachProductImages([{ title: 'Kemp designer', addToCarts: 9 }], products);
    expect(row.image).toBe('https://cdn/kemp.jpg');
  });

  it('gives no image when the title is shared by more than one product', () => {
    const [row] = attachProductImages([{ title: 'Coral bead mala', views: 2 }], products);
    expect(row.image).toBeNull();
  });

  it('gives null when nothing matches or the product has no image', () => {
    const rows = attachProductImages(
      [{ title: 'Deleted product', views: 1 }, { title: 'Plain chain', views: 1 }],
      products,
    );
    expect(rows.map((r) => r.image)).toEqual([null, null]);
  });

  it('does not expose the internal productId', () => {
    const [row] = attachProductImages([{ title: 'Kemp designer', views: 1, productId: '9462510911738' }], products);
    expect(row).not.toHaveProperty('productId');
  });
});
