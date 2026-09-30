import { displayVariantTitle } from '../product/variant-title.util';

/**
 * One row of the dashboard's Low Stock panel.
 *
 * A product lands in the panel as soon as ANY of its variants is at or below
 * the org threshold, but the row used to carry only product-level numbers —
 * "28 in stock · 0 left" read as the whole product running out when only one
 * size had. `lowVariants` names exactly which variants tripped the threshold.
 */

export interface LowStockSourceProduct {
  id: string;
  title: string;
  images: Array<{ src: string | null }>;
  variants: Array<{
    id: string;
    title: string | null;
    sku: string | null;
    price: unknown;
    inventoryQuantity: number;
  }>;
}

export interface LowStockVariant {
  id: string;
  /** Null for a single-variant product's "Default Title" — nothing to name. */
  title: string | null;
  sku: string | null;
  stock: number;
}

export interface LowStockEntry {
  id: string;
  title: string;
  image: string | null;
  currentStock: number;
  lowestVariantStock: number;
  variantCount: number;
  price: string;
  threshold: number;
  /** Variants at or below `threshold`, lowest stock first. */
  lowVariants: LowStockVariant[];
  lowVariantCount: number;
}

/**
 * One low VARIANT, as the dashboard's Low Stock tab lists it. The merchant
 * restocks a size, not a product — "Screw nagas bangles · 2.8 · 0 left" is
 * actionable where "Screw nagas bangles · 28 in stock" is not.
 */
export interface LowStockVariantRow {
  variantId: string;
  productId: string;
  productTitle: string;
  /** Null for a single-variant product — there is no variant to name. */
  variantTitle: string | null;
  sku: string | null;
  stock: number;
  image: string | null;
  threshold: number;
}

/**
 * The `limit` most urgent low variants across ALL products, lowest stock
 * first — not the low variants of the first few products, which would let a
 * product's second size outrank a sold-out size of another product.
 */
export function lowStockVariantRows(
  entries: LowStockEntry[],
  limit: number,
): LowStockVariantRow[] {
  return entries
    .flatMap((e) =>
      e.lowVariants.map((v) => ({
        variantId: v.id,
        productId: e.id,
        productTitle: e.title,
        variantTitle: v.title,
        sku: v.sku,
        stock: v.stock,
        image: e.image,
        threshold: e.threshold,
      })),
    )
    .sort((a, b) => a.stock - b.stock || a.productTitle.localeCompare(b.productTitle))
    .slice(0, limit);
}

export function toLowStockEntry(
  product: LowStockSourceProduct,
  threshold: number,
): LowStockEntry {
  const stocks = product.variants.map((v) => v.inventoryQuantity);
  const prices = product.variants.map((v) => parseFloat(String(v.price)));

  const lowVariants = product.variants
    .filter((v) => v.inventoryQuantity <= threshold)
    .sort((a, b) => a.inventoryQuantity - b.inventoryQuantity)
    .map((v) => ({
      id: v.id,
      title: displayVariantTitle(v.title),
      sku: v.sku,
      stock: v.inventoryQuantity,
    }));

  return {
    id: product.id,
    title: product.title,
    image: product.images[0]?.src ?? null,
    currentStock: stocks.reduce((sum, s) => sum + s, 0),
    lowestVariantStock: stocks.length > 0 ? Math.min(...stocks) : 0,
    variantCount: product.variants.length,
    price: prices.length > 0 ? Math.min(...prices).toFixed(2) : '0.00',
    threshold,
    lowVariants,
    lowVariantCount: lowVariants.length,
  };
}
