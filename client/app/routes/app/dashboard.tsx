import { ArrowRight, Download, Upload, Target, Users, ShoppingBag } from "lucide-react";
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
import { useDashboard, useExportDashboard, useMonthlySales } from "~/hooks/use-dashboard-queries";
import type { SparklinePoint } from "~/components/app/chart-line-default";
import type { MonthlySalesPoint } from "~/services/dashboard.service";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { formatCurrency } from "~/lib/utils";
import { StatCard } from "~/components/app/stat-card";
import { ProductsPanel } from "~/components/app/products-panel";
import { SectionCard } from "~/components/app/section-card";

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
  // Shares a query key with the call inside ProfitBarChart, so React Query
  // serves both from one request.
  const { data: monthlySales } = useMonthlySales();
  const orgCurrency = org?.currency ?? "USD";
  const recentOrders = dashboard?.recentOrders ?? [];
  const monthly = monthlySales?.data;

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
            <Button
              size="action"
              variant="outline"
              onClick={() => exportCsv()}
            >
              <Upload className="size-3.5" />
              Export CSV
            </Button>
            <Button
              variant="brand"
              size="action"
              onClick={() => exportJson()}
            >
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
            sparkline
            sparklineData={sparklineFor(monthly, "revenue")}
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
            sparkline
            sparklineData={sparklineFor(monthly, "orders")}
            label="Total Orders"
            value={dashboard ? dashboard.totalOrders.toLocaleString() : undefined}
            icon={<ShoppingBag className="size-4" />}
            linkTo="/orders"
            linkLabel="View Orders"
            isLoading={isLoading}
          />
          <StatCard
            sparkline
            sparklineData={sparklineFor(monthly, "newCustomers")}
            label="Total Customers"
            value={dashboard ? dashboard.totalCustomers.toLocaleString() : undefined}
            icon={<Users className="size-4" />}
            linkTo="/orders/customers"
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
        <SectionCard
          className="flex flex-2 flex-col"
          title="Recent Orders"
          description="Keep track of recent order data and others information."
          action={
            <Link to="/orders" className="flex items-center gap-1 text-caption font-medium text-brand-strong hover:text-brand-strong-hover">
              View All <ArrowRight className="size-3.5" />
            </Link>
          }
        >
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
        </SectionCard>
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

/**
 * The sparkline beside each KPI, drawn from the same 12-month series the profit
 * chart below plots. Mirrors `sparklineFor` on the analytics route.
 *
 * The card's own figure is an all-time cumulative total while the line is a
 * per-month series — the line is the shape that produced the total, not a
 * breakdown of it. Returns undefined while the request is in flight so the
 * chart renders empty rather than briefly plotting a partial series.
 */
function sparklineFor(
  monthly: MonthlySalesPoint[] | undefined,
  metric: "revenue" | "orders" | "newCustomers",
): SparklinePoint[] | undefined {
  return monthly?.map((point) => ({ label: point.month, value: point[metric] }));
}
