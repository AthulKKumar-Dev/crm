import { Package, X } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { formatProductPrice, type StagedProduct } from "~/lib/product-drag";
import { formatCurrency } from "~/lib/utils";

/** Sentinel for "no variant pinned" — Radix Select rejects an empty string value. */
const ALL_OPTIONS = "__all__";

/**
 * Products staged above the reply box, not yet sent.
 *
 * Staging rather than sending on drop is the whole safety story here: a
 * mis-aimed drag costs a click to undo instead of putting the wrong product in
 * front of a real customer.
 */
export function ComposerProductTray({
  staged,
  onPinVariant,
  onRemove,
  disabled,
}: {
  staged: StagedProduct[];
  onPinVariant: (productId: string, variantId: string | null) => void;
  onRemove: (productId: string) => void;
  disabled?: boolean;
}) {
  if (staged.length === 0) return null;

  return (
    <ul className="mb-2 flex flex-col gap-1.5">
      {staged.map(({ product, variants }) => (
        <li
          key={product.productId}
          className="flex items-center gap-2.5 rounded-lg border bg-muted/40 p-2"
        >
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              <Package className="size-4 text-muted-foreground" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-caption text-foreground">{product.title}</p>
            <p className="text-micro text-muted-foreground">
              {formatProductPrice(product, formatCurrency)}
            </p>
          </div>

          {/* Single-variant products carry no picker — there is nothing to choose. */}
          {variants.length > 0 && (
            <Select
              value={product.variantId ?? ALL_OPTIONS}
              disabled={disabled}
              onValueChange={(value) =>
                onPinVariant(product.productId, value === ALL_OPTIONS ? null : value)
              }
            >
              <SelectTrigger
                size="sm"
                aria-label={`Variant for ${product.title}`}
                className="w-32 shrink-0 text-caption"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OPTIONS}>All options</SelectItem>
                {variants.map((variant) => (
                  <SelectItem key={variant.id} value={variant.id}>
                    {variant.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="ghost"
            size="icon-xs"
            disabled={disabled}
            onClick={() => onRemove(product.productId)}
            aria-label={`Remove ${product.title}`}
            className="shrink-0"
          >
            <X className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
