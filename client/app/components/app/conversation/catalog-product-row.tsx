import { useRef } from "react";
import { Package, Plus } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  formatProductPrice,
  productToStaged,
  writeProductDrag,
  type StagedProduct,
} from "~/lib/product-drag";
import { cn, formatCurrency } from "~/lib/utils";
import type { Product } from "~/types/api";

/**
 * One draggable product in the catalogue.
 *
 * Drag is the accelerator; the Add button is the real control. A row that can
 * only be dragged is unreachable by keyboard and invisible to a screen reader,
 * so both paths call the same handler.
 *
 * Out-of-stock products stay draggable on purpose. The order-create picker
 * disables them, which is right for a cart and exactly wrong here — "is this
 * back in stock yet?" is the conversation where you most need to send it.
 */
export function CatalogProductRow({
  product,
  currency,
  isDragging,
  onDragStateChange,
  onAdd,
}: {
  product: Product;
  currency: string;
  isDragging: boolean;
  onDragStateChange: (productId: string | null) => void;
  onAdd: (staged: StagedProduct) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  const staged = productToStaged(product, currency);
  const price = formatProductPrice(staged.product, formatCurrency);
  const optionsLabel =
    product.variantCount > 1 ? `${product.variantCount} options` : null;

  return (
    <div
      ref={rowRef}
      draggable
      onDragStart={(event) => {
        writeProductDrag(event, staged);
        // Drag the row itself as the cursor image. Without this the browser
        // renders a ghost of the element including its hover background, which
        // reads as a smear rather than as a product.
        if (rowRef.current) {
          event.dataTransfer.setDragImage(rowRef.current, 24, 20);
        }
        onDragStateChange(product.id);
      }}
      onDragEnd={() => onDragStateChange(null)}
      className={cn(
        "group flex cursor-grab items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60 active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {product.image ? (
          <img
            src={product.image.src}
            alt=""
            draggable={false}
            className="size-full object-cover"
          />
        ) : (
          <Package className="size-4 text-muted-foreground" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-caption text-foreground">{product.title}</p>
        <p className="truncate text-micro text-muted-foreground">
          {[price, optionsLabel].filter(Boolean).join(" · ")}
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Attach ${product.title}`}
        title="Attach to reply"
        onClick={() => onAdd(staged)}
        className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}
