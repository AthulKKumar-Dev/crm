import { ArrowRight, Download, Upload, Search, Target, Box, Users, ShoppingBag } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/components/ui/button";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderActions,
} from "~/components/ui/page-header";
import { ProfitBarChart } from "~/components/app/profit-bar-chart";
import { SalesDonutChart } from "~/components/app/sales-donut-chart";
import { OrdersTable } from "~/components/app/orders-table";
import { TopProductsPanel } from "~/components/app/top-products-panel";
import { LowStockProductsPanel } from "~/components/app/low-stock-products-panel";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { EmptyState } from "~/components/app/empty-state";
import { Skeleton } from "~/components/ui/skeleton";
import { useDashboard, useExportDashboard } from "~/hooks/use-dashboard-queries";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { formatCurrency } from "~/lib/utils";
import { StatCard } from "~/components/ui/stat-card";
import { ProductsPanel } from "~/components/app/products-panel";

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
      <div>
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderTitle>Overview</PageHeaderTitle>
            <PageHeaderDescription>
              An overview of recent data of customers info, products details and analysis.
            </PageHeaderDescription>
          </PageHeaderContent>
          <PageHeaderActions>
            <Button className="h-auto px-4.5 py-2" variant="outline" onClick={() => exportCsv()}>
              <Upload className="size-3.5" />
              Export CSV
            </Button>
            <Button className="text-brand h-auto px-4.5 py-2" onClick={() => exportJson()}>
              <Download className="size-3.5" />
              Download Report
            </Button>
          </PageHeaderActions>
        </PageHeader>
      </div>

      {/* Stat cards row */}
      <div className="flex gap-3 ">
        <div className="flex flex-col flex-1 overflow-hidden rounded-lg ring-1 ring-border divide-y divide-border">
          <StatCard
            label="Total Sales"
            value={dashboard ? formatCurrency(dashboard.totalSales, orgCurrency) : undefined}
            icon={<Target className="size-4" />}
            linkTo="/orders"
            linkLabel="View Sales"
            isLoading={isLoading}
          />
          {/* <StatCard
          label="Active Products"
          value={dashboard ? dashboard.totalProducts.toLocaleString() : undefined}
          icon={<Box className="size-4" />}
          linkTo="/products"
          linkLabel="View Products"
          isLoading={isLoading}
        /> */}
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
        <div className="flex flex-col flex-2  overflow-hidden rounded-lg ring-1 ring-border divide-y divide-border">
          <ProfitBarChart currency={orgCurrency} />
          {/* <SalesDonutChart currency={orgCurrency} /> */}
        </div>
      </div>

      {/* Bottom row — recent orders table and top products */}
      <div className="flex gap-3 justify-between">
        <div className="rounded-xl flex-2 flex flex-col bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
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
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyState
                title="No orders yet"
                description="Orders will appear here once synced from your channels."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <OrdersTable orders={recentOrders} currency={orgCurrency} variant="compact" />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-4">
          <ProductsPanel
            topProducts={dashboard?.topSellingProducts}
            lowStockProducts={dashboard?.lowStockProducts}
            isLoading={isLoading}
            currency={orgCurrency}
            className="flex-1"
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Inline stat card ───────────────────────────────────────── */

// function StatCard({
//   label,
//   value,
//   icon,
//   linkTo,
//   linkLabel,
//   isLoading,
// }: {
//   label: string;
//   value?: string;
//   icon: React.ReactNode;
//   linkTo: string;
//   linkLabel: string;
//   isLoading?: boolean;
// }) {
//   return (
//     <div className=" bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
//       <div className="flex items-start justify-between">
//         <p className="text-xs font-medium text-muted-foreground">{label}</p>
//         <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-gray-100 dark:border-gray-700 text-gray-400">
//           {icon}
//         </div>
//       </div>
//       <div className="mt-3">
//         {isLoading ? (
//           <Skeleton className="h-7 w-24" />
//         ) : (
//           <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">
//             {value ?? "—"}
//           </p>
//         )}
//       </div>
//       <Link to={linkTo} className="mt-4 flex items-center gap-1 text-xs font-medium text-[#084734] hover:text-[#3d6000]">
//         {linkLabel} <ArrowRight className="size-3" />
//       </Link>
//     </div>
//   );
// } 
