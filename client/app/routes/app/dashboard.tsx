import { ArrowRight, Download, Upload, Search, Target, Box, Users, ShoppingBag } from "lucide-react";
import { Link } from "react-router";
import { ProfitBarChart } from "~/components/app/profit-bar-chart";
import { SalesDonutChart } from "~/components/app/sales-donut-chart";
import { OrdersTable } from "~/components/app/orders-table";
import { TopProductsPanel } from "~/components/app/top-products-panel";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { EmptyState } from "~/components/app/empty-state";
import { Skeleton } from "~/components/ui/skeleton";
import { useDashboard, useExportDashboard } from "~/hooks/use-dashboard-queries";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { formatCurrency } from "~/lib/utils";

export function meta() {
  return [
    { title: "Dashboard | Collabo CRM" },
    { name: "description", content: "Overview of your CRM data" },
  ];
}

export default function DashboardPage() {
  const { data: dashboard, isLoading } = useDashboard();
  const { exportCsv, exportJson } = useExportDashboard();
  const { data: org } = useCurrentOrg();
  const orgCurrency = org?.currency ?? "USD";
  const recentOrders = dashboard?.recentOrders ?? [];

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
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
              className="h-8 w-48 rounded-lg border border-input bg-white dark:bg-gray-900 pl-8 pr-10 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#CEF17B]/50"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </div>
          <button
            onClick={() => exportCsv()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-white dark:bg-gray-900 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800/60"
          >
            <Upload className="size-3.5" />
            Export CSV
          </button>
          <button
            onClick={() => exportJson()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#CEF17B] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#BADE6F]"
          >
            <Download className="size-3.5" />
            Download Report
          </button>
        </div>
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Sales"
          value={dashboard ? formatCurrency(dashboard.totalSales, orgCurrency) : undefined}
          icon={<Target className="size-4" />}
          linkTo="/orders"
          linkLabel="View Sales"
          isLoading={isLoading}
        />
        <StatCard
          label="Active Products"
          value={dashboard ? dashboard.totalProducts.toLocaleString() : undefined}
          icon={<Box className="size-4" />}
          linkTo="/products"
          linkLabel="View Products"
          isLoading={isLoading}
        />
        <StatCard
          label="Total Orders"
          value={dashboard ? dashboard.totalOrders.toLocaleString() : undefined}
          icon={<ShoppingBag className="size-4" />}
          linkTo="/orders"
          linkLabel="View Orders"
          isLoading={isLoading}
        />
        <StatCard
          label="Total Customers"
          value={dashboard ? dashboard.totalCustomers.toLocaleString() : undefined}
          icon={<Users className="size-4" />}
          linkTo="/customers"
          linkLabel="View Customers"
          isLoading={isLoading}
        />
      </div>

      {/* Charts row — 2 equal columns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProfitBarChart currency={orgCurrency} />
        <SalesDonutChart currency={orgCurrency} />
      </div>

      {/* Bottom row — recent orders table and top products */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border lg:col-span-2">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent Orders</p>
              <p className="text-xs text-muted-foreground">Keep track of recent order data and others information.</p>
            </div>
            <Link to="/orders" className="flex items-center gap-1 text-xs font-medium text-[#084734] hover:text-[#3d6000]">
              View All <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={5} columns={7} />
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No orders yet"
                description="Orders will appear here once synced from your channels."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <OrdersTable orders={recentOrders} currency={orgCurrency} />
            </div>
          )}
        </div>
        <TopProductsPanel products={dashboard?.topSellingProducts} isLoading={isLoading} currency={orgCurrency} />
      </div>
    </div>
  );
}

/* ─── Inline stat card ───────────────────────────────────────── */

function StatCard({
  label,
  value,
  icon,
  linkTo,
  linkLabel,
  isLoading,
}: {
  label: string;
  value?: string;
  icon: React.ReactNode;
  linkTo: string;
  linkLabel: string;
  isLoading?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-gray-100 dark:border-gray-700 text-gray-400">
          {icon}
        </div>
      </div>
      <div className="mt-3">
        {isLoading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">
            {value ?? "—"}
          </p>
        )}
      </div>
      <Link to={linkTo} className="mt-4 flex items-center gap-1 text-xs font-medium text-[#084734] hover:text-[#3d6000]">
        {linkLabel} <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}
