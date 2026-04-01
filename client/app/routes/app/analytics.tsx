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
import { StatCard } from "~/components/app/stat-card";
import {
  ANALYTICS_STATS,
  ANALYTICS_TREND_DATA,
  ANALYTICS_CHANNEL_DATA,
} from "~/lib/placeholder-data";

export function meta() {
  return [{ title: "Analytics | Collabo CRM" }];
}

const STATUS_COLOR: Record<string, string> = {
  Organic: "#cdff8c",
  "Paid Search": "#6366f1",
  Social: "#f59e0b",
  Email: "#0ea5e9",
  Direct: "#8b5cf6",
  Referral: "#ec4899",
};

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Deep-dive into your sales, traffic, and performance metrics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="h-8 rounded-lg border border-input bg-white px-3 text-xs text-muted-foreground focus:outline-none shadow-sm">
            <option>Last 12 months</option>
            <option>Last 6 months</option>
            <option>Last 30 days</option>
          </select>
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

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ANALYTICS_STATS.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* Revenue trend area chart */}
      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-border">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Revenue Trend</p>
            <p className="text-xs text-muted-foreground">Monthly revenue over the past year</p>
          </div>
          <select className="rounded-md border border-input bg-transparent px-2 py-0.5 text-xs text-muted-foreground focus:outline-none">
            <option>Revenue</option>
            <option>Orders</option>
            <option>Sessions</option>
          </select>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={ANALYTICS_TREND_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#cdff8c" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#cdff8c" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              formatter={(value) => [`$${Number(value).toLocaleString()}`, "Revenue"]}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#cdff8c"
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
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-border">
          <div className="mb-4">
            <p className="text-sm font-semibold text-gray-900">Traffic by Channel</p>
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
              <Bar dataKey="sessions" name="Sessions" fill="#cdff8c" radius={[0, 4, 4, 0]} />
              <Bar dataKey="orders" name="Orders" fill="#cdff8c" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Channel metrics table */}
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-border overflow-hidden">
          <div className="px-5 py-4 border-b">
            <p className="text-sm font-semibold text-gray-900">Channel Performance</p>
            <p className="text-xs text-muted-foreground">Revenue breakdown by acquisition channel</p>
          </div>
          <div className="divide-y divide-border">
            {ANALYTICS_CHANNEL_DATA.map((row) => {
              const convRate = ((row.orders / row.sessions) * 100).toFixed(1);
              return (
                <div key={row.channel} className="flex items-center gap-3 px-5 py-3">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: STATUS_COLOR[row.channel] ?? "#9ca3af" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-900">{row.channel}</p>
                    <p className="text-xs text-muted-foreground">{row.sessions.toLocaleString()} sessions</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-gray-900">${row.revenue.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{convRate}% conv.</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Orders vs Sessions dual-axis trend */}
      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-border">
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-900">Orders & Sessions Over Time</p>
          <p className="text-xs text-muted-foreground">Compare traffic volume to order conversions monthly</p>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={ANALYTICS_TREND_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="sessions" name="Sessions" fill="#cdff8c" radius={[4, 4, 0, 0]} />
            <Bar dataKey="orders" name="Orders" fill="#cdff8c" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
