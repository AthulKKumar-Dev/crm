import { useState } from "react";
import { Search, Plus, Filter, ChevronLeft, ChevronRight, Package, ListChecks, PackageX, AlertTriangle } from "lucide-react";
import { StatCard } from "~/components/app/stat-card";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { EmptyState } from "~/components/app/empty-state";
import { Skeleton } from "~/components/ui/skeleton";
import { useProducts, useProductTypes, useProductStats } from "~/hooks/use-product-queries";
import type { ProductStatus, ProductListParams } from "~/types/api";

export function meta() {
  return [{ title: "Products | Collabo CRM" }];
}

const STATUS_LABEL: Record<ProductStatus, string> = {
  ACTIVE: "Active",
  DRAFT: "Draft",
  ARCHIVED: "Archived",
};

const STATUS_CLASS: Record<ProductStatus, string> = {
  ACTIVE: "bg-[#CEF17B]/30 text-[#084734]",
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  ARCHIVED: "bg-orange-100 text-orange-700",
};

const PAGE_SIZE = 12;

export default function ProductsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  const params: ProductListParams = {
    page: currentPage,
    limit: PAGE_SIZE,
    search: searchQuery || undefined,
    productType: selectedType !== "All" ? selectedType : undefined,
  };

  const { data, isLoading } = useProducts(params);
  const { data: productTypes } = useProductTypes();
  const { data: stats, isLoading: statsLoading } = useProductStats();

  const products = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const categoryFilters = ["All", ...(productTypes ?? [])];

  function handleSearchChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(event.target.value);
    setCurrentPage(1);
  }

  function handleTypeFilter(type: string) {
    setSelectedType(type);
    setCurrentPage(1);
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Products</h1>
          <p className="text-sm text-muted-foreground">
            Manage your product catalog, inventory, and pricing.
          </p>
        </div>
        <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#CEF17B] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#BADE6F]">
          <Plus className="size-3.5" />
          Add Product
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
              <Skeleton className="h-3 w-24 mb-4" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))
        ) : stats ? (
          <>
            <StatCard
              label="Total Products"
              value={stats.totalProducts.toLocaleString()}
              change={0}
              icon={<Package className="size-4" />}
            />
            <StatCard
              label="Active Listings"
              value={stats.activeListings.toLocaleString()}
              change={0}
              icon={<ListChecks className="size-4" />}
            />
            <StatCard
              label="Out of Stock"
              value={stats.outOfStockProducts.toLocaleString()}
              change={0}
              icon={<PackageX className="size-4" />}
            />
            <StatCard
              label="Low Stock Items"
              value={stats.lowStockProducts.toLocaleString()}
              change={0}
              icon={<AlertTriangle className="size-4" />}
            />
          </>
        ) : (
          <>
            <StatCard label="Total Products" value="—" change={0} icon={<Package className="size-4" />} />
            <StatCard label="Active Listings" value="—" change={0} icon={<ListChecks className="size-4" />} />
            <StatCard label="Out of Stock" value="—" change={0} icon={<PackageX className="size-4" />} />
            <StatCard label="Low Stock Items" value="—" change={0} icon={<AlertTriangle className="size-4" />} />
          </>
        )}
      </div>

      {/* Search input and category filter pills */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or SKU…"
            value={searchQuery}
            onChange={handleSearchChange}
            className="h-8 w-full rounded-lg border border-input bg-white dark:bg-gray-900 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#CEF17B]/50"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="size-3.5 text-muted-foreground" />
          {categoryFilters.map((filterName) => (
            <button
              key={filterName}
              onClick={() => handleTypeFilter(filterName)}
              className={`h-7 rounded-full px-3 text-xs font-medium transition-colors ${
                selectedType === filterName
                  ? "bg-[#CEF17B]/30 text-[#084734]"
                  : "bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border border-input"
              }`}
            >
              {filterName}
            </button>
          ))}
        </div>
      </div>

      {/* Products table */}
      {isLoading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products found"
          description={searchQuery ? "Try adjusting your search or filters." : "Connect a channel to sync your products."}
        />
      ) : (
        <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/60 dark:bg-gray-800/60 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Product</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Vendor</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Price</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Stock</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {product.image ? (
                          <img
                            src={product.image.src}
                            alt={product.image.alt ?? product.title}
                            className="size-9 shrink-0 rounded-lg object-cover bg-gray-100 dark:bg-gray-800"
                          />
                        ) : (
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-400">
                            <span className="text-lg">📦</span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
                            {product.title}
                          </span>
                          {product.variantCount > 1 && (
                            <p className="text-[11px] text-muted-foreground">{product.variantCount} variants</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{product.productType ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{product.vendor ?? "—"}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-900 dark:text-gray-100 text-right">
                      {product.priceRange.min === product.priceRange.max
                        ? `$${Number(product.priceRange.min).toFixed(2)}`
                        : `$${Number(product.priceRange.min).toFixed(2)} – $${Number(product.priceRange.max).toFixed(2)}`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-medium ${product.totalStock === 0 ? "text-red-600" : product.totalStock < 100 ? "text-orange-600" : "text-gray-900 dark:text-gray-100"}`}>
                        {product.totalStock.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[product.status]}`}>
                        {product.totalStock === 0 && product.status === "ACTIVE" ? "Out of Stock" : STATUS_LABEL[product.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {products.length} of {meta?.total ?? 0} products
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 h-7 rounded-md border border-input bg-white dark:bg-gray-900 px-3 text-xs text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronLeft className="size-3" />
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 h-7 rounded-md border border-input bg-white dark:bg-gray-900 px-3 text-xs text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-40 disabled:pointer-events-none"
              >
                Next
                <ChevronRight className="size-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
