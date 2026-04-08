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
import { Download, Upload } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { StatCard } from "~/components/app/stat-card";
import {
  ANALYTICS_STATS,
  ANALYTICS_TREND_DATA,
  ANALYTICS_CHANNEL_DATA,
} from "~/lib/placeholder-data";

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

/**
 * Analytics page — provides deep-dive visualizations for revenue trends,
 * traffic by channel, and orders-vs-sessions over time.
 */
export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Deep-dive into your sales, traffic, and performance metrics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select defaultValue="12m">
            <SelectTrigger className="h-8 w-[135px] rounded-lg border border-input bg-white dark:bg-gray-900 dark:text-gray-300 px-3 text-xs text-muted-foreground shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12m">Last 12 months</SelectItem>
              <SelectItem value="6m">Last 6 months</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
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

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ANALYTICS_STATS.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* Revenue trend area chart */}
      <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Revenue Trend</p>
            <p className="text-xs text-muted-foreground">Monthly revenue over the past year</p>
          </div>
          <Select defaultValue="revenue">
            <SelectTrigger className="h-7 w-[95px] rounded-md border border-input bg-transparent dark:bg-gray-900 px-2 text-xs text-muted-foreground shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="orders">Orders</SelectItem>
              <SelectItem value="sessions">Sessions</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={ANALYTICS_TREND_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#CEF17B" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#CEF17B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} tickFormatter={(rawValue) => `$${(rawValue / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              formatter={(value) => [`$${Number(value).toLocaleString()}`, "Revenue"]}
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

      {/* Channel breakdown + metrics table */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Bar chart — traffic by channel */}
        <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
          <div className="mb-4">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Traffic by Channel</p>
            <p className="text-xs text-muted-foreground">Sessions and orders per acquisition source</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ANALYTICS_CHANNEL_DATA} layout="vertical" margin={{ top: 0, right: 4, left: 20, bottom: 0 }}>
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
        </div>

        {/* Channel metrics table */}
        <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border overflow-hidden">
          <div className="px-5 py-4 border-b">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Channel Performance</p>
            <p className="text-xs text-muted-foreground">Revenue breakdown by acquisition channel</p>
          </div>
          <div className="divide-y divide-border">
            {ANALYTICS_CHANNEL_DATA.map((channelRow) => {
              const conversionRate = ((channelRow.orders / channelRow.sessions) * 100).toFixed(1);
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
                    <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">${channelRow.revenue.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{conversionRate}% conv.</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Orders vs Sessions dual-axis trend */}
      <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Orders & Sessions Over Time</p>
          <p className="text-xs text-muted-foreground">Compare traffic volume to order conversions monthly</p>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={ANALYTICS_TREND_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
