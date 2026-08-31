import { useState } from "react";
import { PackageSearch, Search } from "lucide-react";

import { QueryErrorState } from "~/components/app/query-error-state";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { useDebounced } from "~/hooks/use-debounced";
import { useProducts } from "~/hooks/use-product-queries";
import { cn } from "~/lib/utils";
import type { StagedProduct } from "~/lib/product-drag";

import { CatalogProductRow } from "./catalog-product-row";

/**
 * The Catalog tab — live search over the merchant's real products.
 *
 * Unlike the rest of the inbox, this data is NOT mocked: it hits `GET /products`
 * against whatever the connected channel has synced. `useProducts` already sets
 * `keepPreviousData`, so the list holds steady between keystrokes instead of
 * collapsing to a skeleton on every character.
 *
 * `status: "ACTIVE"` only — sharing a draft or archived product with a customer
 * would point them at something they cannot buy.
 */
export function CatalogPanel({
  currency,
  onAdd,
  className,
  ...rest
}: {
  currency: string;
  onAdd: (staged: StagedProduct) => void;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const [query, setQuery] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const debounced = useDebounced(query);

  const { data, isLoading, isError, refetch, isPlaceholderData } = useProducts({
    search: debounced || undefined,
    status: "ACTIVE",
    limit: 20,
  });

  const products = data?.data ?? [];

  return (
    <div className={cn("flex min-h-0 flex-col", className)} {...rest}>
      <div className="shrink-0 border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products"
            aria-label="Search products to share"
            className="pl-8 text-caption"
          />
        </div>
        <p className="mt-2 text-micro text-muted-foreground">
          Drag a product into the chat, or use the + button.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {isError ? (
          <div className="p-3">
            <QueryErrorState resource="products" onRetry={() => refetch()} />
          </div>
        ) : isLoading ? (
          <div className="space-y-1 p-1">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-2.5 px-1 py-2">
                <Skeleton className="size-9 shrink-0 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <PackageSearch className="size-5 text-muted-foreground" />
            <p className="text-caption text-muted-foreground">
              {query
                ? `No active products match “${query}”.`
                : "No products synced from your channels yet."}
            </p>
          </div>
        ) : (
          <div className={cn("transition-opacity", isPlaceholderData && "opacity-60")}>
            {products.map((product) => (
              <CatalogProductRow
                key={product.id}
                product={product}
                currency={currency}
                isDragging={draggingId === product.id}
                onDragStateChange={setDraggingId}
                onAdd={onAdd}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
