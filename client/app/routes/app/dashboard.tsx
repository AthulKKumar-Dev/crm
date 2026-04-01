import { ArrowRight, Download, Upload, Search, Target, Box } from "lucide-react";
import { Link } from "react-router";
import { TrendingUp, TrendingDown } from "lucide-react";
import { ProfitBarChart } from "~/components/app/profit-bar-chart";
import { SalesDonutChart } from "~/components/app/sales-donut-chart";
import { OrdersTable } from "~/components/app/orders-table";
import { TopProductsPanel } from "~/components/app/top-products-panel";
import { DASHBOARD_STATS, SAMPLE_ORDERS } from "~/lib/placeholder-data";

export function meta() {
  return [
    { title: "Dashboard | Collabo CRM" },
    { name: "description", content: "Overview of your CRM data" },
  ];
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            An overview of recent data of customers info, products details and analysis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative hidden lg:block">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search here..."
              className="h-8 w-48 rounded-lg border border-input bg-white pl-8 pr-10 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </div>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-white px-3 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50">
            <Upload className="size-3.5" />
            Export CSV
          </button>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#b8e87a]">
            <Download className="size-3.5" />
            Download Report
          </button>
        </div>
      </div>

      {/* Top row — 3 equal columns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Col 1 — two stacked stat cards */}
        <div className="flex flex-col gap-4">
          <div className="flex-1 rounded-xl bg-white p-5 shadow-sm ring-1 ring-border">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-muted-foreground">{DASHBOARD_STATS[0].label}</p>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-gray-100 text-gray-400">
                <Target className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-end gap-3">
              <p className="text-2xl font-bold text-gray-900 leading-none">{DASHBOARD_STATS[0].value}</p>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
                <TrendingDown className="size-3" />
                {Math.abs(DASHBOARD_STATS[0].change)}%
              </span>
            </div>
            <Link to="/orders" className="mt-4 flex items-center gap-1 text-xs font-medium text-[#4d7a00] hover:text-[#3d6000]">
              View Sales Details <ArrowRight className="size-3" />
            </Link>
          </div>

          <div className="flex-1 rounded-xl bg-white p-5 shadow-sm ring-1 ring-border">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-muted-foreground">{DASHBOARD_STATS[1].label}</p>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-gray-100 text-gray-400">
                <Box className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-end gap-3">
              <p className="text-2xl font-bold text-gray-900 leading-none">{DASHBOARD_STATS[1].value}</p>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#cdff8c]/30 px-2 py-0.5 text-xs font-semibold text-[#4d7a00]">
                <TrendingUp className="size-3" />
                {DASHBOARD_STATS[1].change}%
              </span>
            </div>
            <Link to="/products" className="mt-4 flex items-center gap-1 text-xs font-medium text-[#4d7a00] hover:text-[#3d6000]">
              View All Products <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>

        {/* Col 2 — Profit bar chart */}
        <ProfitBarChart />

        {/* Col 3 — Sales donut */}
        <SalesDonutChart />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-border lg:col-span-2">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Recent Orders</p>
              <p className="text-xs text-muted-foreground">Keep track of recent order data and others information.</p>
            </div>
            <Link to="/orders" className="flex items-center gap-1 text-xs font-medium text-[#4d7a00] hover:text-[#3d6000]">
              View All <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <OrdersTable orders={SAMPLE_ORDERS.slice(0, 5)} />
          </div>
        </div>
        <TopProductsPanel />
      </div>
    </div>
  );
}
