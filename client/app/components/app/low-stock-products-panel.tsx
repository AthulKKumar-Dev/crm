import { Link } from "react-router";
import { AlertTriangle, ArrowRight, Package } from "lucide-react";
import { Skeleton } from "~/components/ui/skeleton";
import { formatCurrency } from "~/lib/utils";
import type { DashboardLowStockProduct } from "~/types/api";

interface LowStockProductsPanelProps {
  products?: DashboardLowStockProduct[];
  currency: string;
  isLoading?: boolean;
}

export function LowStockProductsPanel({ products, currency, isLoading }: LowStockProductsPanelProps) {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-orange-50 text-orange-600 dark:bg-orange-950/40">
            <AlertTriangle className="size-3.5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Low Stock Products</p>
            <p className="text-xs text-muted-foreground">Top 5 items running low on inventory.</p>
          </div>
        </div>
        <Link to="/products" className="flex items-center gap-1 text-xs font-medium text-[#084734] hover:text-[#3d6000]">
          View All <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {isLoading ? (
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <Skeleton className="size-10 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      ) : !products || products.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center">
          <Package className="size-6 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">All products are well-stocked.</p>
        </div>
      ) : (
        <ul className="divide-y">
          {products.map((product, index) => {
            const stockTone = product.lowestVariantStock === 0
              ? "text-red-600 bg-red-50 dark:bg-red-950/30"
              : product.lowestVariantStock <= Math.max(1, Math.floor(product.threshold / 2))
                ? "text-orange-600 bg-orange-50 dark:bg-orange-950/30"
                : "text-amber-600 bg-amber-50 dark:bg-amber-950/30";

            return (
              <li key={product.id} className="flex items-center gap-3 px-5 py-3">
                <span className="w-5 text-xs font-medium text-muted-foreground tabular-nums">{index + 1}</span>

                <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                  {product.image ? (
                    <img src={product.image} alt={product.title} className="size-full object-cover" />
                  ) : (
                    <Package className="size-4 text-muted-foreground" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">{product.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatCurrency(product.price, currency)}
                    {product.variantCount > 1 && <> · {product.variantCount} variants</>}
                  </p>
                </div>

                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${stockTone}`}>
                  {product.currentStock} left
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
