import { useState, useMemo } from "react";
import { Search, Download, Upload, ChevronLeft, ChevronRight, ShoppingBag, Package, Target, Box } from "lucide-react";
import { StatCard } from "~/components/app/stat-card";
import { OrdersTable } from "~/components/app/orders-table";
import { ORDER_STATS, SAMPLE_ORDERS } from "~/lib/placeholder-data";

export function meta() {
  return [
    { title: "Orders | Collabo CRM" },
    { name: "description", content: "Manage and track all your orders" },
  ];
}

const ORDER_STAT_ICONS = [
  <ShoppingBag className="size-4" />,
  <Package className="size-4" />,
  <Target className="size-4" />,
  <Box className="size-4" />,
];

const PAGE_SIZE = 9;

export default function OrdersPage() {
  const [query, setQuery] = useState("");
  const [page, setPage]   = useState(1);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return SAMPLE_ORDERS;
    return SAMPLE_ORDERS.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.productName.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q)
    );
  }, [query]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-muted-foreground">
            An overview of recent data of customers info, products details and analysis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-white px-3 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50">
            <Upload className="size-3.5" />
            Export CSV
          </button>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#b8e87a]">
            <Download className="size-3.5" />
            Download Report
          </button>
          <select className="h-8 rounded-lg border border-input bg-white px-3 text-xs font-medium text-gray-700 shadow-sm focus:outline-none">
            <option>Last 7 Days</option>
            <option>Last 30 Days</option>
            <option>Last 90 Days</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {ORDER_STATS.map((stat, i) => (
          <StatCard key={stat.label} {...stat} icon={ORDER_STAT_ICONS[i]} />
        ))}
      </div>

      <div className="rounded-xl bg-white shadow-sm ring-1 ring-border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">All Orders</p>
            <p className="text-xs text-muted-foreground">Keep track of recent order data and others information.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search here..."
              value={query}
              onChange={handleSearch}
              className="h-8 w-48 rounded-lg border border-input bg-transparent pl-8 pr-10 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </div>

        <div className="overflow-x-auto">
          <OrdersTable orders={paginated} showCustomerName />
        </div>

        <div className="flex items-center justify-between border-t px-5 py-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="inline-flex items-center gap-1 rounded-lg border border-input bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="size-3.5" />
            Previous
          </button>
          <p className="text-xs text-muted-foreground">
            Showing entries {(page - 1) * PAGE_SIZE + 1} to{" "}
            {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="inline-flex items-center gap-1 rounded-lg border border-input bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40"
          >
            Next
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
