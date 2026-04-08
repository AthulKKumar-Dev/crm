import { Package } from "lucide-react";
import { Skeleton } from "~/components/ui/skeleton";
import type { DashboardTopProduct } from "~/types/api";

interface TopProductsPanelProps {
  products?: DashboardTopProduct[];
  isLoading?: boolean;
}

/** Panel listing the top-selling products with sales counts and stock info. */
export function TopProductsPanel({ products, isLoading }: TopProductsPanelProps) {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
      <p className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Top Selling Products</p>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : !products || products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Package className="size-8 text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-xs text-muted-foreground">No product data yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((product) => (
            <div key={product.externalProductId} className="flex items-center gap-3">
              {product.image ? (
                <img
                  src={product.image}
                  alt={product.title}
                  className="size-10 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 object-cover"
                />
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                  <Package className="size-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100 leading-tight">
                  {product.title}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Stock: <span className="font-medium">{product.currentStock.toLocaleString()}</span>
                </p>
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                  ${parseFloat(product.price).toFixed(2)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-semibold text-[#084734]">
                  {product.totalQuantitySold.toLocaleString()} sold
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {product.totalOrders.toLocaleString()} orders
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
