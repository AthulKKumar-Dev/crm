import { Package } from "lucide-react";

import { formatProductPrice } from "~/lib/product-drag";
import { cn, formatCurrency } from "~/lib/utils";
import type { MessageProduct } from "~/types/api";

/**
 * A shared product, inside a message bubble.
 *
 * Everything rendered here comes off the message itself, never from a fresh
 * catalogue lookup — see the MessageProduct docblock. A price that silently
 * updated after the fact would make the transcript disagree with what the
 * customer was actually quoted.
 *
 * Deliberately no "View product" link: there is no handle/slug column on
 * Product anywhere in the schema, so a storefront URL cannot be built without
 * a server change. A dead link would be worse than none.
 */
export function MessageProductCard({
  product,
  isOutbound,
}: {
  product: MessageProduct;
  isOutbound: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg p-2",
        // Inside a lime outbound bubble a plain bg-card would read as a hole
        // punched through it; a translucent white sits on the brand fill.
        isOutbound ? "bg-ink-foreground/70" : "bg-card",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md",
          isOutbound ? "bg-brand-forest/10" : "bg-muted",
        )}
      >
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <Package
            className={cn(
              "size-4",
              isOutbound ? "text-brand-forest" : "text-muted-foreground",
            )}
          />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-caption",
            isOutbound ? "text-brand-forest" : "text-foreground",
          )}
        >
          {product.title}
        </p>
        <p
          className={cn(
            "truncate text-micro",
            isOutbound ? "text-brand-forest/75" : "text-muted-foreground",
          )}
        >
          {[product.variantTitle, formatProductPrice(product, formatCurrency)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </div>
  );
}
