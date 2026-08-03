import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { StatCard } from "~/components/app/stat-card";
import {
  useAnalyticsDashboard,
  useRefreshAnalytics,
} from "~/hooks/use-analytics-queries";
import { QueryErrorState } from "~/components/app/query-error-state";
import type {
  AnalyticsRange,
  AnalyticsChannelFilter,
} from "~/services/analytics.service";

export function meta() {
  return [{ title: "Analytics | Collabo CRM" }];
}

/**
 * Pixel-first analytics dashboard.
 *
 * Channel filter (All / Shopify / Instagram / WhatsApp) scopes the read to
 * that platform's snapshot rows. Only Shopify writes data today — the other
 * filters return an empty-but-valid shape until their pipelines land.
 */
export default function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [channel, setChannel] = useState<AnalyticsChannelFilter>("all");

  const { data, isLoading, isFetching, isError, refetch } = useAnalyticsDashboard({ range, channel });
  const refresh = useRefreshAnalytics();

  const stats = data?.stats ?? [];
  const trend = data?.trend ?? [];
  const topPages = data?.topPages ?? [];
  const topViewedProducts = data?.topViewedProducts ?? [];
  const topAddedToCart = data?.topAddedToCart ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Storefront behaviour tracked by the Web Pixel.
            {data?.meta.lastRefreshedAt ? (
              <span className="ml-2 text-xs">
                · Last refreshed {formatLastRefreshed(data.meta.lastRefreshedAt)}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={channel}
            onValueChange={(v) => setChannel(v as AnalyticsChannelFilter)}
          >
            <SelectTrigger className="h-8 w-[140px] rounded-lg border border-input bg-white dark:bg-gray-900 dark:text-gray-300 px-3 text-xs text-muted-foreground shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              <SelectItem value="shopify">Shopify</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={(v) => setRange(v as AnalyticsRange)}>
            <SelectTrigger className="h-8 w-[135px] rounded-lg border border-input bg-white dark:bg-gray-900 dark:text-gray-300 px-3 text-xs text-muted-foreground shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="6m">Last 6 months</SelectItem>
              <SelectItem value="12m">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => refresh.mutate({ range, channel })}
            disabled={refresh.isPending}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-white dark:bg-gray-900 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800/60 disabled:opacity-60"
          >
            <RefreshCw className={`size-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* 1. Basic stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map(({ key, label, value, change, changeLabel }) => (
          <StatCard
            key={key}
            label={label}
            value={value.toLocaleString()}
            change={change}
            changeLabel={changeLabel}
          />
        ))}
        {/* On failure the grid rendered completely blank: `stats` fell back to
            [] so nothing mapped, and this placeholder is gated on isLoading,
            so it disappeared too — a broken page and a quiet one looked the
            same. */}
        {isError && !data ? (
          <div className="col-span-full">
            <QueryErrorState resource="analytics" onRetry={() => refetch()} />
          </div>
        ) : isLoading && stats.length === 0 ? (
          <div className="col-span-full rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border text-xs text-muted-foreground">
            Loading analytics…
          </div>
        ) : null}
      </div>

      {/* 2. Top lists */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TopList
          title="Most Viewed Pages"
          subtitle="Top 5 pages by views in this period"
          rows={topPages.map((p) => ({
            key: p.path,
            label: p.title || p.path,
            sub: p.title ? p.path : null,
            value: p.views,
            unit: "views",
          }))}
        />
        <TopList
          title="Most Viewed Products"
          subtitle="Top 5 products by unique viewers"
          rows={topViewedProducts.map((p) => ({
            key: p.title,
            label: p.title,
            sub: null,
            value: p.views,
            unit: "views",
          }))}
        />
        <TopList
          title="Most Added-to-Cart Products"
          subtitle="Top 5 products by add-to-cart events"
          rows={topAddedToCart.map((p) => ({
            key: p.title,
            label: p.title,
            sub: null,
            value: p.addToCarts,
            unit: "add to cart",
          }))}
        />
      </div>

      {/* 3. Trend graph */}
      <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Cart, Checkout &amp; Orders Over Time
            </p>
            <p className="text-xs text-muted-foreground">
              {range === "30d"
                ? "Daily trends over the past 30 days"
                : range === "6m"
                  ? "Monthly trends over the past 6 months"
                  : "Monthly trends over the past year"}
            </p>
          </div>
          {isFetching ? (
            <span className="text-xs text-muted-foreground">Updating…</span>
          ) : null}
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="addToCart"
              name="Add to Cart"
              stroke="#CEF17B"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="reachedCheckout"
              name="Reached Checkout"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="completedOrders"
              name="Completed Orders"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function formatLastRefreshed(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `on ${then.toLocaleDateString()} at ${then.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

interface TopListRow {
  key: string;
  label: string;
  sub: string | null;
  value: number;
  unit: string;
}

function TopList({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: TopListRow[];
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border overflow-hidden">
      <div className="px-5 py-4 border-b">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="divide-y divide-border">
        {rows.length === 0 ? (
          <div className="px-5 py-6 text-xs text-muted-foreground">
            No data for this period yet. Data appears after the Web Pixel
            starts sending events and Refresh (or the hourly rollup) runs.
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.key} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                  {row.label}
                </p>
                {row.sub ? (
                  <p className="truncate text-xs text-muted-foreground">{row.sub}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                  {row.value.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">{row.unit}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
