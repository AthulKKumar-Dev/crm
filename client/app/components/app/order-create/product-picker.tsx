import { useEffect, useState } from "react";
import { Search, Plus } from "lucide-react";
import { useProducts } from "~/hooks/use-product-queries";
import { formatCurrency } from "~/lib/utils";
import type { Product, ProductVariant } from "~/types/api";

export type CartLineSeed = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  unitPrice: number;
  inventoryQuantity: number;
  gstRate: number | null;
};

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function ProductPicker({
  onAdd,
  currency,
  excludedVariantIds,
}: {
  onAdd: (line: CartLineSeed) => void;
  currency: string;
  excludedVariantIds: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const { data, isLoading } = useProducts({
    search: debounced || undefined,
    limit: 8,
    status: "ACTIVE",
  });

  const rows: Array<{ product: Product; variant: ProductVariant }> = [];
  for (const product of data?.data ?? []) {
    for (const variant of product.variants) {
      if (excludedVariantIds.has(variant.id)) continue;
      rows.push({ product, variant });
    }
  }

  function add(product: Product, variant: ProductVariant) {
    onAdd({
      variantId: variant.id,
      productId: product.id,
      productTitle: product.title,
      variantTitle: variant.title,
      unitPrice: variant.price,
      inventoryQuantity: variant.inventoryQuantity,
      // Product GST rate is not exposed on the list summary; the server is the
      // source of truth at submit time. UI shows preview using 0 fallback.
      gstRate: null,
    });
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search products by name, vendor or SKU…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-white dark:bg-gray-900 pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#CEF17B]/50"
        />
      </div>

      <div className="rounded-lg border bg-white dark:bg-gray-900 max-h-72 overflow-y-auto">
        {isLoading ? (
          <p className="p-3 text-xs text-muted-foreground">Searching…</p>
        ) : rows.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            {debounced
              ? `No products match "${debounced}".`
              : "Start typing to search products."}
          </p>
        ) : (
          rows.map(({ product, variant }) => {
            const oos = variant.inventoryQuantity <= 0;
            return (
              <div
                key={variant.id}
                className="flex items-center justify-between gap-3 border-b last:border-b-0 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                    {product.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {variant.title}
                    {variant.sku ? ` • SKU ${variant.sku}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {formatCurrency(variant.price, currency)}
                  </p>
                  <p
                    className={`text-[10px] tabular-nums ${
                      oos
                        ? "text-red-600"
                        : variant.inventoryQuantity <= 5
                          ? "text-amber-600"
                          : "text-muted-foreground"
                    }`}
                  >
                    {variant.inventoryQuantity} in stock
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => add(product, variant)}
                  disabled={oos}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#CEF17B] px-3 text-xs font-medium text-gray-900 hover:bg-[#BADE6F] disabled:pointer-events-none disabled:opacity-40"
                >
                  <Plus className="size-3.5" />
                  Add
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
