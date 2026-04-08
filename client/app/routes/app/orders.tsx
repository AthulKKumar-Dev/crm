import { useState } from "react";
import { Search, Download, Upload, ChevronLeft, ChevronRight, ShoppingBag, Package, Target, Box } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { StatCard } from "~/components/app/stat-card";
import { OrdersTable } from "~/components/app/orders-table";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { EmptyState } from "~/components/app/empty-state";
import { Skeleton } from "~/components/ui/skeleton";
import { useOrders, useOrderStats } from "~/hooks/use-order-queries";
import type { OrderListParams, DashboardQueryParams } from "~/types/api";

export function meta() {
  return [
    { title: "Orders | Collabo CRM" },
    { name: "description", content: "Manage and track all your orders" },
  ];
}

const PAGE_SIZE = 9;

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

const DATE_RANGE_MAP: Record<string, number | null> = { all: null, "7d": 7, "30d": 30, "90d": 90 };

export default function OrdersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [dateRange, setDateRange] = useState("all");

  const daysBack = DATE_RANGE_MAP[dateRange];
  const dateFrom = daysBack != null ? daysAgo(daysBack) : undefined;

  const params: OrderListParams = {
    page: currentPage,
    limit: PAGE_SIZE,
    search: searchQuery || undefined,
    dateFrom,
  };

  const statsParams: DashboardQueryParams | undefined = dateFrom ? { dateFrom } : undefined;

  const { data, isLoading } = useOrders(params);
  const { data: stats, isLoading: statsLoading } = useOrderStats(statsParams);
  const orders = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  function handleSearchChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(event.target.value);
    setCurrentPage(1);
  }

  function handleDateRangeChange(value: string) {
    setDateRange(value);
    setCurrentPage(1);
  }

  /** Format a stat metric value for display. */
  function formatChange(direction: "up" | "down" | "same", percentage: number) {
    return direction === "down" ? -percentage : percentage;
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Orders</h1>
          <p className="text-sm text-muted-foreground">
            An overview of recent data of customers info, products details and analysis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-white dark:bg-gray-900 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800/60">
            <Upload className="size-3.5" />
            Export CSV
          </button>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#CEF17B] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#BADE6F]">
            <Download className="size-3.5" />
            Download Report
          </button>
          <Select value={dateRange} onValueChange={handleDateRangeChange}>
            <SelectTrigger className="h-8 w-[120px] rounded-lg border border-input bg-white dark:bg-gray-900 dark:border-gray-700 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
              label="Total New Orders"
              value={stats.totalNewOrders.current.toLocaleString()}
              change={formatChange(stats.totalNewOrders.change.direction, stats.totalNewOrders.change.percentage)}
              changeLabel="vs previous period"
              icon={<ShoppingBag className="size-4" />}
            />
            <StatCard
              label="Pending Orders"
              value={stats.pendingOrders.current.toLocaleString()}
              change={formatChange(stats.pendingOrders.change.direction, stats.pendingOrders.change.percentage)}
              changeLabel="vs previous period"
              icon={<Package className="size-4" />}
            />
            <StatCard
              label="Total Sales"
              value={`$${Number(stats.totalSales.current).toLocaleString()}`}
              change={formatChange(stats.totalSales.change.direction, stats.totalSales.change.percentage)}
              changeLabel="vs previous period"
              icon={<Target className="size-4" />}
            />
            <StatCard
              label="Products Sold"
              value={Number(stats.totalProductsSold.current).toLocaleString()}
              change={formatChange(stats.totalProductsSold.change.direction, stats.totalProductsSold.change.percentage)}
              changeLabel="vs previous period"
              icon={<Box className="size-4" />}
            />
          </>
        ) : (
          <>
            <StatCard label="Total New Orders" value="—" change={0} icon={<ShoppingBag className="size-4" />} />
            <StatCard label="Pending Orders" value="—" change={0} icon={<Package className="size-4" />} />
            <StatCard label="Total Sales" value="—" change={0} icon={<Target className="size-4" />} />
            <StatCard label="Products Sold" value="—" change={0} icon={<Box className="size-4" />} />
          </>
        )}
      </div>

      {/* Orders table with search and pagination */}
      <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
        {/* Table header with search */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">All Orders</p>
            <p className="text-xs text-muted-foreground">Keep track of recent order data and others information.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search here..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="h-8 w-48 rounded-lg border border-input bg-transparent pl-8 pr-10 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#CEF17B]/50"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Table body */}
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={PAGE_SIZE} columns={7} />
          </div>
        ) : orders.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No orders found"
              description={searchQuery ? "Try adjusting your search." : "Orders will appear here once synced from your channels."}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <OrdersTable orders={orders} showCustomerName />
          </div>
        )}

        {/* Pagination controls */}
        {!isLoading && orders.length > 0 && (
          <div className="flex items-center justify-between border-t px-5 py-3">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="inline-flex items-center gap-1 rounded-lg border border-input bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800/60 disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" />
              Previous
            </button>
            <p className="text-xs text-muted-foreground">
              Page {meta?.page ?? 1} of {totalPages} ({meta?.total ?? 0} total)
            </p>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-input bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800/60 disabled:pointer-events-none disabled:opacity-40"
            >
              Next
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
