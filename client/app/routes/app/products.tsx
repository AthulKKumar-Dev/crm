import { useState } from "react";
import { Search, Plus, Filter } from "lucide-react";
import { StatCard } from "~/components/app/stat-card";
import { CATALOG_STATS, SAMPLE_CATALOG, type ProductStatus } from "~/lib/placeholder-data";

export function meta() {
  return [{ title: "Products | Collabo CRM" }];
}

/* ─── Status display configuration ─────────────────────────────── */

const STATUS_LABEL: Record<ProductStatus, string> = {
  ACTIVE: "Active",
  DRAFT: "Draft",
  OUT_OF_STOCK: "Out of Stock",
  ARCHIVED: "Archived",
};

const STATUS_CLASS: Record<ProductStatus, string> = {
  ACTIVE: "bg-[#cdff8c]/30 text-[#4d7a00]",
  DRAFT: "bg-gray-100 text-gray-600",
  OUT_OF_STOCK: "bg-red-100 text-red-700",
  ARCHIVED: "bg-orange-100 text-orange-700",
};

/** Available category filter options for the product catalog. */
const CATEGORY_FILTERS = ["All", "Electronics", "Clothes", "Shoes", "Furniture", "Home Appliances"];

/**
 * Products page — displays catalog statistics, category filters,
 * a searchable product table with stock and status indicators.
 */
export default function ProductsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  /** Filter products by name/SKU search and selected category. */
  const filteredProducts = SAMPLE_CATALOG.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

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
        <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#b8e87a]">
          <Plus className="size-3.5" />
          Add Product
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CATALOG_STATS.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* Search input and category filter pills */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or SKU…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-white dark:bg-gray-900 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="size-3.5 text-muted-foreground" />
          {CATEGORY_FILTERS.map((categoryName) => (
            <button
              key={categoryName}
              onClick={() => setSelectedCategory(categoryName)}
              className={`h-7 rounded-full px-3 text-xs font-medium transition-colors ${
                selectedCategory === categoryName
                  ? "bg-[#cdff8c]/30 text-[#4d7a00]"
                  : "bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border border-input"
              }`}
            >
              {categoryName}
            </button>
          ))}
        </div>
      </div>

      {/* Products table */}
      <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/60 dark:bg-gray-800/60 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Product</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">SKU</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Category</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Price</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Stock</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Sold</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    No products match your search.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-400">
                          <span className="text-lg">📦</span>
                        </div>
                        <span className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
                          {product.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{product.sku}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{product.category}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-900 dark:text-gray-100 text-right">
                      ${product.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-medium ${product.stock === 0 ? "text-red-600" : product.stock < 100 ? "text-orange-600" : "text-gray-900 dark:text-gray-100"}`}>
                        {product.stock.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground text-right">
                      {product.sold.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[product.status]}`}>
                        {STATUS_LABEL[product.status]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {filteredProducts.length} of {SAMPLE_CATALOG.length} products
          </p>
          <div className="flex items-center gap-1">
            <button className="h-7 rounded-md border border-input bg-white dark:bg-gray-900 px-3 text-xs text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-40" disabled>
              Previous
            </button>
            <button className="h-7 rounded-md border border-input bg-white dark:bg-gray-900 px-3 text-xs text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-40" disabled>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
