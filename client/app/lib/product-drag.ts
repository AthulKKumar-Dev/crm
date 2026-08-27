/**
 * Dragging a product from the catalogue into a conversation.
 *
 * Native HTML5 drag-and-drop — the app has no DnD library and does not need one
 * for a single-payload copy gesture. The two existing hand-rolled cases
 * (variant-editor.tsx, image-gallery-uploader.tsx) only move an array index
 * within one list; this is the first that carries an identity across
 * components, so the encoding rules live here rather than at the call sites.
 */

import type { MessageProduct, Product } from "~/types/api";

/**
 * A custom MIME type, deliberately not `text/plain`.
 *
 * Dragging a text selection, a file, or an image from another tab all put
 * `text/plain` or `Files` on the dataTransfer. Keying the drop zone on our own
 * type means those drags pass straight over the composer instead of lighting it
 * up and then failing to parse on drop.
 */
export const PRODUCT_DRAG_MIME = "application/x-collabo-product";

/** A variant the agent can pin once the product is staged. */
export interface StagedVariant {
  id: string;
  title: string;
  price: number;
  sku: string | null;
}

/**
 * What travels on the drag, and what sits in the composer tray.
 *
 * The variants ride along rather than being re-fetched on drop: the catalogue
 * list response already contains them, and a second request would leave the
 * staged card's dropdown empty for a beat right when the agent reaches for it.
 */
export interface StagedProduct {
  /** Exactly what gets sent. */
  product: MessageProduct;
  /** Empty when the product has a single variant — nothing to choose. */
  variants: StagedVariant[];
}

/**
 * Does this drag carry one of our products?
 *
 * Uses `types`, NOT `getData`. The DataTransfer is in "protected mode" during
 * dragenter/dragover — `getData()` returns an empty string there and only
 * becomes readable on drop. `types` is readable throughout, and is the only way
 * to decide whether to show the drop affordance while the pointer is still
 * moving. Reaching for `getData()` here is why drop zones either highlight for
 * every drag or never highlight at all.
 */
export function hasProductDrag(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes(PRODUCT_DRAG_MIME);
}

/** Attach a staged product to a drag. */
export function writeProductDrag(event: React.DragEvent, staged: StagedProduct): void {
  event.dataTransfer.setData(PRODUCT_DRAG_MIME, JSON.stringify(staged));
  event.dataTransfer.effectAllowed = "copy";
}

/**
 * Read it back on drop. Null when the drag was not ours or the payload was
 * malformed — a drop handler must never throw, or the browser is left
 * mid-gesture with no way out.
 */
export function readProductDrag(event: React.DragEvent): StagedProduct | null {
  const raw = event.dataTransfer.getData(PRODUCT_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StagedProduct;
    return parsed?.product?.productId ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Project a catalogue Product onto the staged shape.
 *
 * No variant is pinned at drag time — that happens on the staged card — except
 * when the product has exactly one, where asking would be a pointless step.
 *
 * `variant.price` is a Prisma Decimal and arrives as a *string* over JSON
 * despite being typed `number`, so it goes through Number() once here rather
 * than at every place that would otherwise do arithmetic on it.
 */
export function productToStaged(product: Product, currency: string): StagedProduct {
  const variants: StagedVariant[] = product.variants.map((variant) => ({
    id: variant.id,
    title: variant.title,
    price: Number(variant.price),
    sku: variant.sku,
  }));

  const onlyVariant = variants.length === 1 ? variants[0] : null;

  return {
    variants: onlyVariant ? [] : variants,
    product: {
      productId: product.id,
      variantId: onlyVariant?.id ?? null,
      title: product.title,
      variantTitle: onlyVariant?.title ?? null,
      sku: onlyVariant?.sku ?? null,
      price: onlyVariant ? onlyVariant.price : null,
      priceRange: onlyVariant
        ? null
        : {
            min: Number(product.priceRange.min),
            max: Number(product.priceRange.max),
          },
      currency,
      imageUrl: product.image?.src ?? null,
    },
  };
}

/** Re-point a staged product at one variant, or back to the whole range. */
export function pinVariant(
  staged: StagedProduct,
  variantId: string | null,
  priceRange: { min: number; max: number } | null,
): StagedProduct {
  const variant = staged.variants.find((v) => v.id === variantId);

  if (!variant) {
    return {
      ...staged,
      product: {
        ...staged.product,
        variantId: null,
        variantTitle: null,
        sku: null,
        price: null,
        priceRange: priceRange ?? staged.product.priceRange,
      },
    };
  }

  return {
    ...staged,
    product: {
      ...staged.product,
      variantId: variant.id,
      variantTitle: variant.title,
      sku: variant.sku,
      price: variant.price,
      priceRange: null,
    },
  };
}

/** "₹2,499" when a variant is pinned, "₹1,899 – ₹2,499" when it is not. */
export function formatProductPrice(
  product: Pick<MessageProduct, "price" | "priceRange" | "currency">,
  format: (
    amount: number | string,
    currency: string,
    options?: { maximumFractionDigits?: number },
  ) => string,
): string {
  const opts = { maximumFractionDigits: 0 };

  if (product.price != null) return format(product.price, product.currency, opts);
  if (!product.priceRange) return "—";

  const { min, max } = product.priceRange;
  return min === max
    ? format(min, product.currency, opts)
    : `${format(min, product.currency, opts)} – ${format(max, product.currency, opts)}`;
}
