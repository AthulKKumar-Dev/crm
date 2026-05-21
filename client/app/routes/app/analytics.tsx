import { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Download, RefreshCw, Upload } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { StatCard } from "~/components/app/stat-card";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { formatCurrency } from "~/lib/utils";
import {
  useAnalyticsOverview,
  useRefreshAnalytics,
} from "~/hooks/use-analytics-queries";
import type {
  AnalyticsRange,
  AnalyticsChannelRow,
  AnalyticsFunnel,
  AnalyticsProductRow,
} from "~/services/analytics.service";

export function meta() {
  return [{ title: "Analytics | Collabo CRM" }];
}

/** Color mapping for each traffic acquisition channel. */
const CHANNEL_COLOR: Record<string, string> = {
  Organic: "#CEF17B",
  "Paid Search": "#6366f1",
  Social: "#f59e0b",
  Email: "#0ea5e9",
  Direct: "#8b5cf6",
  Referral: "#ec4899",
};

/** Banner shown when ShopifyQL is unavailable (Basic plan / scope missing). */
function FallbackBanner({ source }: { source: string }) {
  if (source !== "shopify_orders_fb") return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      Showing order-derived metrics. Connect a Shopify Advanced or Plus store
      (and grant the <code className="font-mono">read_reports</code> scope) to
      see sessions, pageviews, and add-to-cart rate from Shopify Analytics.
    </div>
  );
}

/**
 * Analytics page — deep-dive into sales, traffic, and performance metrics
 * sourced from Shopify's `shopifyqlQuery` (sessions dataset) or, on
 * Basic-plan stores, from local order data as a coarse fallback.
 */
export default function AnalyticsPage() {
  const { data: org } = useCurrentOrg();
  const orgCurrency = org?.currency ?? "USD";
  const [range, setRange] = useState<AnalyticsRange>("12m");

  const { data, isLoading, isFetching } = useAnalyticsOverview({ range });
  const refresh = useRefreshAnalytics();

  const stats = data?.stats ?? [];
  const trend = data?.trend ?? [];
  const channels: AnalyticsChannelRow[] = data?.channels ?? [];
  const funnel: AnalyticsFunnel = data?.funnel ?? {
    sessions: 0,
    pageviews: 0,
    addToCarts: 0,
    reachedCheckout: 0,
    orders: 0,
  };
  const topViewedProducts: AnalyticsProductRow[] = data?.topViewedProducts ?? [];
  const topAddedToCart: AnalyticsProductRow[] = data?.topAddedToCart ?? [];
  const source = data?.source ?? "none";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Deep-dive into your sales, traffic, and performance metrics.
            {data?.lastRefreshedAt ? (
              <span className="ml-2 text-xs">
                · Last refreshed {formatLastRefreshed(data.lastRefreshedAt)}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as AnalyticsRange)}>
            <SelectTrigger className="h-8 w-[135px] rounded-lg border border-input bg-white dark:bg-gray-900 dark:text-gray-300 px-3 text-xs text-muted-foreground shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12m">Last 12 months</SelectItem>
              <SelectItem value="6m">Last 6 months</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => refresh.mutate({ range })}
            disabled={refresh.isPending}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-white dark:bg-gray-900 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800/60 disabled:opacity-60"
          >
            <RefreshCw className={`size-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-white dark:bg-gray-900 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800/60">
            <Upload className="size-3.5" />
            Export CSV
          </button>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#CEF17B] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#BADE6F]">
            <Download className="size-3.5" />
            Download Report
          </button>
        </div>
      </div>

      <FallbackBanner source={source} />

      {/* Stat cards — 6 metrics in 2 rows of 3 on desktop */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(({ key, label, value, change, changeLabel }) => (
          <StatCard
            key={key}
            label={label}
            value={value}
            change={change}
            changeLabel={changeLabel}
          />
        ))}
        {isLoading && stats.length === 0 ? (
          <div className="col-span-full rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border text-xs text-muted-foreground">
            Loading analytics…
          </div>
        ) : null}
      </div>

      {/* Revenue trend area chart */}
      <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Revenue Trend</p>
            <p className="text-xs text-muted-foreground">
              {range === "30d" ? "Daily revenue over the past 30 days" : range === "6m" ? "Monthly revenue over the past 6 months" : "Monthly revenue over the past year"}
            </p>
          </div>
          {isFetching ? <span className="text-xs text-muted-foreground">Updating…</span> : null}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#CEF17B" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#CEF17B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} tickFormatter={(rawValue) => `${formatCurrency(rawValue / 1000, orgCurrency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k`} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              formatter={(value) => [formatCurrency(Number(value), orgCurrency), "Revenue"]}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#CEF17B"
              strokeWidth={2}
              fill="url(#colorRevenue)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Conversion funnel — sessions → views → carts → checkouts → orders */}
      <ConversionFunnel funnel={funnel} />

      {/* Top viewed & top added-to-cart products */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProductTable
          title="Top Viewed Products"
          subtitle="Products with the most page views in this period"
          rows={topViewedProducts}
          primaryKey="productViews"
          primaryLabel="views"
          secondaryKey="addToCarts"
          secondaryLabel="add to cart"
        />
        <ProductTable
          title="Top Added-to-Cart Products"
          subtitle="Products customers add to cart most often"
          rows={topAddedToCart}
          primaryKey="addToCarts"
          primaryLabel="add to cart"
          secondaryKey="productViews"
          secondaryLabel="views"
        />
      </div>

      {/* Channel breakdown + metrics table */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Bar chart — traffic by channel */}
        <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
          <div className="mb-4">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Traffic by Channel</p>
            <p className="text-xs text-muted-foreground">Sessions and orders per acquisition source</p>
          </div>
          {channels.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
              No referrer breakdown yet — refresh after the next sync.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={channels} layout="vertical" margin={{ top: 0, right: 4, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="channel" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} width={72} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Bar dataKey="sessions" name="Sessions" fill="#CEF17B" radius={[0, 4, 4, 0]} />
                <Bar dataKey="orders" name="Orders" fill="#CEF17B" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Channel metrics table */}
        <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border overflow-hidden">
          <div className="px-5 py-4 border-b">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Channel Performance</p>
            <p className="text-xs text-muted-foreground">Revenue breakdown by acquisition channel</p>
          </div>
          <div className="divide-y divide-border">
            {channels.length === 0 ? (
              <div className="px-5 py-6 text-xs text-muted-foreground">No channel data for this period.</div>
            ) : (
              channels.map((channelRow) => {
                const conversionRate = channelRow.sessions > 0
                  ? ((channelRow.orders / channelRow.sessions) * 100).toFixed(1)
                  : "0.0";
                return (
                  <div key={channelRow.channel} className="flex items-center gap-3 px-5 py-3">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: CHANNEL_COLOR[channelRow.channel] ?? "#9ca3af" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{channelRow.channel}</p>
                      <p className="text-xs text-muted-foreground">{channelRow.sessions.toLocaleString()} sessions</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(channelRow.revenue, orgCurrency, { minimumFractionDigits: 0 })}</p>
                      <p className="text-xs text-muted-foreground">{conversionRate}% conv.</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Orders vs Sessions dual-axis trend (kept at end so the high-signal
          funnel + per-product panels surface above the older chart) */}
      <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Orders & Sessions Over Time</p>
          <p className="text-xs text-muted-foreground">Compare traffic volume to order conversions monthly</p>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="sessions" name="Sessions" fill="#CEF17B" radius={[4, 4, 0, 0]} />
            <Bar dataKey="orders" name="Orders" fill="#CEF17B" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Format an ISO timestamp as a friendly "x minutes ago" / "at HH:MM" string. */
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

// ─── Conversion Funnel ─────────────────────────────────────────────────────

// 4 monotonic steps (each ≤ previous, sessions-based). Pageviews is shown
// separately because total pages viewed routinely exceeds sessions and so
// would break the drop-off math.
const FUNNEL_STEPS = [
  { key: "sessions" as const, label: "Sessions" },
  { key: "addToCarts" as const, label: "Added to Cart" },
  { key: "reachedCheckout" as const, label: "Reached Checkout" },
  { key: "orders" as const, label: "Completed Orders" },
];

/**
 * Renders the 4-step conversion funnel as stacked horizontal bars sized
 * relative to total sessions. Each row shows the absolute count, its share
 * of sessions, and the drop-off vs the previous step. Pageviews (a
 * non-funnel metric) is shown in the header.
 */
function ConversionFunnel({ funnel }: { funnel: AnalyticsFunnel }) {
  const base = funnel.sessions || 0;
  const hasData = FUNNEL_STEPS.some((s) => funnel[s.key] > 0);
  const pageviewsPerSession =
    base > 0 ? (funnel.pageviews / base).toFixed(1) : "0.0";

  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Conversion Funnel</p>
          <p className="text-xs text-muted-foreground">
            From traffic to completed orders, with drop-off at each step.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Pageviews</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {funnel.pageviews.toLocaleString()}
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
              ({pageviewsPerSession}/session)
            </span>
          </p>
        </div>
      </div>
      {!hasData ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
          No funnel data for this period — refresh after the next sync.
        </div>
      ) : (
        <div className="space-y-2.5">
          {FUNNEL_STEPS.map((step, index) => {
            const value = funnel[step.key];
            const sharePct = base > 0 ? (value / base) * 100 : 0;
            const prev = index === 0 ? value : funnel[FUNNEL_STEPS[index - 1].key];
            const dropoffPct = prev > 0 ? ((prev - value) / prev) * 100 : 0;
            return (
              <div key={step.key}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                    {step.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {value.toLocaleString()}
                    {index > 0 && dropoffPct > 0 ? (
                      <span className="ml-2 text-[10px] text-red-500">
                        ↓ {dropoffPct.toFixed(1)}%
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="h-6 w-full overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                  <div
                    className="flex h-full items-center justify-end rounded-md bg-[#CEF17B] pr-2 text-[10px] font-semibold text-gray-900 transition-all"
                    style={{ width: `${Math.max(sharePct, 1)}%` }}
                  >
                    {sharePct >= 6 ? `${sharePct.toFixed(1)}%` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Product table (top viewed / top added-to-cart) ───────────────────────

interface ProductTableProps {
  title: string;
  subtitle: string;
  rows: AnalyticsProductRow[];
  primaryKey: "productViews" | "addToCarts";
  primaryLabel: string;
  secondaryKey: "productViews" | "addToCarts";
  secondaryLabel: string;
}

function ProductTable({
  title,
  subtitle,
  rows,
  primaryKey,
  primaryLabel,
  secondaryKey,
  secondaryLabel,
}: ProductTableProps) {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border overflow-hidden">
      <div className="px-5 py-4 border-b">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="divide-y divide-border">
        {rows.length === 0 ? (
          <div className="px-5 py-6 text-xs text-muted-foreground">
            No data yet for this period. Add-to-cart and checkout counts come
            from Shopify cart + checkout webhooks; per-product page views
            aren't exposed by webhooks (they need a Web Pixel) so this table
            only fills once shoppers add items to cart or start checkout.
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.title} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                  {row.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row[secondaryKey].toLocaleString()} {secondaryLabel}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                  {row[primaryKey].toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">{primaryLabel}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
