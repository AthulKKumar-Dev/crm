import { useState, useCallback } from "react";
import { Package, ChevronLeft, ChevronRight, TrendingUp, ShoppingCart, BarChart3, Trophy } from "lucide-react";
import { Skeleton } from "~/components/ui/skeleton";
import type { DashboardTopProduct } from "~/types/api";

interface TopProductsPanelProps {
  products?: DashboardTopProduct[];
  isLoading?: boolean;
}

export function TopProductsPanel({ products, isLoading }: TopProductsPanelProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const total = products?.length ?? 0;

  const goPrev = useCallback(() => setActiveIndex((i) => (i - 1 + total) % total), [total]);
  const goNext = useCallback(() => setActiveIndex((i) => (i + 1) % total), [total]);

  if (isLoading) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 p-6 shadow-xl min-h-[360px]">
        <Skeleton className="h-4 w-40 mb-6 bg-white/10" />
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="size-36 rounded-2xl bg-white/10" />
          <Skeleton className="h-4 w-48 bg-white/10" />
          <div className="grid grid-cols-2 gap-3 w-full mt-2">
            <Skeleton className="h-16 rounded-xl bg-white/10" />
            <Skeleton className="h-16 rounded-xl bg-white/10" />
            <Skeleton className="h-16 rounded-xl bg-white/10" />
            <Skeleton className="h-16 rounded-xl bg-white/10" />
          </div>
        </div>
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 p-6 shadow-xl min-h-[360px] flex flex-col items-center justify-center">
        <Package className="size-10 text-white/20 mb-3" />
        <p className="text-sm text-white/40">No product data yet</p>
      </div>
    );
  }

  const product = products[activeIndex];
  const revenue = product.totalQuantitySold * parseFloat(product.price);
  const stockStatus = product.currentStock === 0 ? "out" : product.currentStock < 10 ? "low" : "healthy";

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#042a20] via-[#084734] to-[#0a5c45] p-5 shadow-xl min-h-[360px] flex flex-col">
      {/* Decorative glow */}
      <div className="pointer-events-none absolute -top-20 -right-20 size-56 rounded-full bg-[#CEF17B]/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 size-40 rounded-full bg-[#CEF17B]/10 blur-3xl" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-[#CEF17B]" />
          <p className="text-sm font-semibold text-white">Top Products</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={goPrev}
            className="flex size-7 items-center justify-center rounded-lg bg-white/10 backdrop-blur-sm text-white/70 hover:bg-white/20 hover:text-white transition-all"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="text-[11px] font-medium text-white/50 tabular-nums min-w-[32px] text-center">
            {activeIndex + 1}/{total}
          </span>
          <button
            onClick={goNext}
            className="flex size-7 items-center justify-center rounded-lg bg-white/10 backdrop-blur-sm text-white/70 hover:bg-white/20 hover:text-white transition-all"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Product showcase */}
      <div className="flex-1 flex flex-col items-center relative z-10">
        {/* Rank badge */}
        <div className="absolute -top-1 left-0 z-20">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#CEF17B] px-2.5 py-0.5 text-[10px] font-bold text-[#084734] shadow-lg">
            #{activeIndex + 1}
          </span>
        </div>

        {/* Product image — glass card */}
        <div className="relative mb-4 rounded-2xl bg-white/10 backdrop-blur-md p-3 ring-1 ring-white/20 shadow-2xl">
          {product.image ? (
            <img
              src={product.image}
              alt={product.title}
              className="size-28 rounded-xl object-cover"
            />
          ) : (
            <div className="flex size-28 items-center justify-center rounded-xl bg-white/5">
              <Package className="size-10 text-white/30" />
            </div>
          )}
        </div>

        {/* Title + price */}
        <h3 className="text-sm font-semibold text-white text-center leading-snug mb-1 line-clamp-2 max-w-[220px]">
          {product.title}
        </h3>
        <p className="text-lg font-bold text-[#CEF17B] mb-4">
          ${parseFloat(product.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>

        {/* Stats grid — glassmorphism cards */}
        <div className="grid grid-cols-2 gap-2.5 w-full">
          <div className="rounded-xl bg-white/[0.08] backdrop-blur-sm ring-1 ring-white/10 p-3 text-center">
            <TrendingUp className="size-3.5 text-[#CEF17B] mx-auto mb-1" />
            <p className="text-base font-bold text-white leading-none">{product.totalQuantitySold.toLocaleString()}</p>
            <p className="text-[10px] text-white/50 mt-0.5">Units Sold</p>
          </div>
          <div className="rounded-xl bg-white/[0.08] backdrop-blur-sm ring-1 ring-white/10 p-3 text-center">
            <ShoppingCart className="size-3.5 text-[#CEF17B] mx-auto mb-1" />
            <p className="text-base font-bold text-white leading-none">{product.totalOrders.toLocaleString()}</p>
            <p className="text-[10px] text-white/50 mt-0.5">Orders</p>
          </div>
          <div className="rounded-xl bg-white/[0.08] backdrop-blur-sm ring-1 ring-white/10 p-3 text-center">
            <BarChart3 className="size-3.5 text-[#CEF17B] mx-auto mb-1" />
            <p className="text-base font-bold text-white leading-none">
              ${revenue >= 1000 ? `${(revenue / 1000).toFixed(1)}k` : revenue.toFixed(0)}
            </p>
            <p className="text-[10px] text-white/50 mt-0.5">Revenue</p>
          </div>
          <div className="rounded-xl bg-white/[0.08] backdrop-blur-sm ring-1 ring-white/10 p-3 text-center">
            <Package className="size-3.5 text-[#CEF17B] mx-auto mb-1" />
            <p className={`text-base font-bold leading-none ${stockStatus === "out" ? "text-red-400" : stockStatus === "low" ? "text-amber-400" : "text-white"}`}>
              {product.currentStock.toLocaleString()}
            </p>
            <p className="text-[10px] text-white/50 mt-0.5">In Stock</p>
          </div>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5 mt-4 relative z-10">
        {products.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={`rounded-full transition-all duration-300 ${
              i === activeIndex
                ? "w-5 h-1.5 bg-[#CEF17B]"
                : "size-1.5 bg-white/25 hover:bg-white/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
