import { useState } from "react";
import {
  Search, Plus, Filter, ChevronLeft, ChevronRight, Package, ListChecks,
  PackageX, AlertTriangle, X, Loader2, Check, FileText,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { StatCard } from "~/components/app/stat-card";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { EmptyState } from "~/components/app/empty-state";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { useProducts, useProductTypes, useProductStats } from "~/hooks/use-product-queries";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "~/lib/api-client";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type { ProductStatus, ProductListParams, Product } from "~/types/api";

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

const GST_RATE_OPTIONS = ["0", "5", "12", "18", "28"];

const PAGE_SIZE = 12;

export default function ProductsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const { data: org } = useCurrentOrg();
  const gstEnabled = org?.gstEnabled ?? false;

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
            <StatCard label="Total Products" value={stats.totalProducts.toLocaleString()} change={0} icon={<Package className="size-4" />} />
            <StatCard label="Active Listings" value={stats.activeListings.toLocaleString()} change={0} icon={<ListChecks className="size-4" />} />
            <StatCard label="Out of Stock" value={stats.outOfStockProducts.toLocaleString()} change={0} icon={<PackageX className="size-4" />} />
            <StatCard label="Low Stock Items" value={stats.lowStockProducts.toLocaleString()} change={0} icon={<AlertTriangle className="size-4" />} />
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

      {/* Search and filter */}
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
                  {gstEnabled && (
                    <>
                      <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">HSN</th>
                      <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">GST %</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((product) => (
                  <tr
                    key={product.id}
                    className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    onClick={() => gstEnabled ? setEditingProductId(product.id) : undefined}
                  >
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
                    {gstEnabled && (
                      <>
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                          {(product as any).hsnCode || <span className="text-orange-500">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {(product as any).gstRate != null ? `${(product as any).gstRate}%` : <span className="text-orange-500">—</span>}
                        </td>
                      </>
                    )}
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

          {/* Pagination */}
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
                <ChevronLeft className="size-3" />Previous
              </button>
              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 h-7 rounded-md border border-input bg-white dark:bg-gray-900 px-3 text-xs text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-40 disabled:pointer-events-none"
              >
                Next<ChevronRight className="size-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product GST Dialog */}
      {editingProductId && gstEnabled && (
        <EditProductGstDialog
          productId={editingProductId}
          product={products.find((p) => p.id === editingProductId) ?? null}
          onClose={() => setEditingProductId(null)}
        />
      )}
    </div>
  );
}

// ── Edit Product GST Dialog ─────────────────────────────────────────────────

function EditProductGstDialog({
  productId,
  product,
  onClose,
}: {
  productId: string;
  product: Product | null;
  onClose: () => void;
}) {
  const [hsnCode, setHsnCode] = useState((product as any)?.hsnCode ?? "");
  const [gstRate, setGstRate] = useState((product as any)?.gstRate?.toString() ?? "");
  const queryClient = useQueryClient();

  const updateGst = useMutation({
    mutationFn: (data: { hsnCode?: string; gstRate?: number }) =>
      apiClient.patch(`/products/${productId}/gst`, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product GST info updated.");
      onClose();
    },
    onError: (error) => handleMutationError(error, "Failed to update product GST."),
  });

  function handleSave() {
    updateGst.mutate({
      hsnCode: hsnCode || undefined,
      gstRate: gstRate ? parseFloat(gstRate) : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">GST Details</h2>
            <p className="text-[10px] text-muted-foreground line-clamp-1">{product?.title}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400">HSN/SAC Code</label>
            <input
              value={hsnCode}
              onChange={(e) => setHsnCode(e.target.value)}
              placeholder="e.g. 6109 (T-Shirts)"
              maxLength={10}
              className="mt-1 w-full rounded-lg border bg-white dark:bg-gray-800 px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-[#cdff8c]"
            />
            <p className="mt-0.5 text-[9px] text-muted-foreground">
              The Harmonized System code that determines the GST rate for this product.
            </p>
          </div>

          <div>
            <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400">GST Rate (%)</label>
            <Select value={gstRate} onValueChange={setGstRate}>
              <SelectTrigger className="mt-1 h-9 text-xs">
                <SelectValue placeholder="Select GST rate" />
              </SelectTrigger>
              <SelectContent>
                {GST_RATE_OPTIONS.map((rate) => (
                  <SelectItem key={rate} value={rate} className="text-xs">
                    {rate}% {rate === "0" ? "(Exempt)" : rate === "5" ? "(Essential)" : rate === "18" ? "(Standard)" : rate === "28" ? "(Luxury)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t px-5 py-4">
          <button
            onClick={handleSave}
            disabled={updateGst.isPending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#cdff8c] px-4 py-2 text-xs font-semibold text-gray-900 hover:bg-[#b8e67d] disabled:opacity-50 transition-colors"
          >
            {updateGst.isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
            Save
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
