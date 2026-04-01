import { useState, useMemo } from "react";
import { Search, Download, Upload, ChevronLeft, ChevronRight, ShoppingBag, Package, Target, Box } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { StatCard } from "~/components/app/stat-card";
import { OrdersTable } from "~/components/app/orders-table";
import { ORDER_STATS, SAMPLE_ORDERS } from "~/lib/placeholder-data";

export function meta() {
  return [
    { title: "Orders | Collabo CRM" },
    { name: "description", content: "Manage and track all your orders" },
  ];
}

/** Icon list corresponding to each order stat card by index. */
const ORDER_STAT_ICONS = [
  <ShoppingBag className="size-4" />,
  <Package className="size-4" />,
  <Target className="size-4" />,
  <Box className="size-4" />,
];

/** Number of orders displayed per page. */
const PAGE_SIZE = 9;

/**
 * Orders page — displays order statistics, a searchable/paginated
 * table of all orders, and CSV export controls.
 */
export default function OrdersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  /** Filter orders by search query against ID, product name, or customer name. */
  const filteredOrders = useMemo(() => {
    const normalizedQuery = searchQuery.toLowerCase();
    if (!normalizedQuery) return SAMPLE_ORDERS;
    return SAMPLE_ORDERS.filter(
      (order) =>
        order.id.toLowerCase().includes(normalizedQuery) ||
        order.productName.toLowerCase().includes(normalizedQuery) ||
        order.customerName.toLowerCase().includes(normalizedQuery)
    );
  }, [searchQuery]);

  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE);
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  /** Reset to page 1 whenever the search query changes. */
  function handleSearchChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(event.target.value);
    setCurrentPage(1);
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
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#b8e87a]">
            <Download className="size-3.5" />
            Download Report
          </button>
          <Select defaultValue="7d">
            <SelectTrigger className="h-8 w-[120px] rounded-lg border border-input bg-white dark:bg-gray-900 dark:border-gray-700 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {ORDER_STATS.map((stat, statIndex) => (
          <StatCard key={stat.label} {...stat} icon={ORDER_STAT_ICONS[statIndex]} />
        ))}
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
              className="h-8 w-48 rounded-lg border border-input bg-transparent pl-8 pr-10 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Table body */}
        <div className="overflow-x-auto">
          <OrdersTable orders={paginatedOrders} showCustomerName />
        </div>

        {/* Pagination controls */}
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
            Showing entries {(currentPage - 1) * PAGE_SIZE + 1} to{" "}
            {Math.min(currentPage * PAGE_SIZE, filteredOrders.length)} of {filteredOrders.length}
          </p>
          <button
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="inline-flex items-center gap-1 rounded-lg border border-input bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800/60 disabled:pointer-events-none disabled:opacity-40"
          >
            Next
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
