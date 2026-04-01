import { ShoppingBag, Globe, Package, TrendingUp, TrendingDown, Plus, ExternalLink, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function meta() {
  return [{ title: "Channel | Collabo CRM" }];
}

const CHANNEL_STATS = [
  { label: "Active Channels",   value: "5",       change: 1,   positive: true,  changeLabel: "vs last month" },
  { label: "Total GMV",         value: "$284,910", change: 31,  positive: true,  changeLabel: "vs last month" },
  { label: "Channel Orders",    value: "4,821",    change: 18,  positive: true,  changeLabel: "vs last month" },
  { label: "Sync Errors",       value: "3",        change: -60, positive: true,  changeLabel: "vs last month" },
];

type ChannelStatus = "CONNECTED" | "SYNCING" | "ERROR";

interface SalesChannel {
  id: string;
  name: string;
  type: string;
  status: ChannelStatus;
  orders: number;
  revenue: number;
  products: number;
  lastSync: string;
}

const CHANNELS: SalesChannel[] = [
  { id: "1", name: "Shopify Store",      type: "shopify",    status: "CONNECTED", orders: 1842, revenue: 128400, products: 284, lastSync: "2 min ago" },
  { id: "2", name: "Amazon Seller",      type: "amazon",     status: "CONNECTED", orders: 1204, revenue: 84200,  products: 96,  lastSync: "5 min ago" },
  { id: "3", name: "eBay Store",         type: "ebay",       status: "SYNCING",   orders: 621,  revenue: 32800,  products: 142, lastSync: "Syncing…" },
  { id: "4", name: "WooCommerce",        type: "woocommerce",status: "CONNECTED", orders: 890,  revenue: 29400,  products: 211, lastSync: "12 min ago" },
  { id: "5", name: "Etsy Shop",          type: "etsy",       status: "ERROR",     orders: 264,  revenue: 10110,  products: 58,  lastSync: "Failed — 1h ago" },
];

const REVENUE_BY_CHANNEL = [
  { name: "Shopify",     revenue: 128400 },
  { name: "Amazon",      revenue: 84200 },
  { name: "WooCommerce", revenue: 29400 },
  { name: "eBay",        revenue: 32800 },
  { name: "Etsy",        revenue: 10110 },
];

const STATUS_CONFIG: Record<ChannelStatus, { label: string; className: string; icon: React.ReactNode }> = {
  CONNECTED: { label: "Connected", className: "bg-[#cdff8c]/30 text-[#4d7a00]", icon: <CheckCircle className="size-3" /> },
  SYNCING:   { label: "Syncing",   className: "bg-blue-100 text-blue-700",       icon: <Clock className="size-3" /> },
  ERROR:     { label: "Error",     className: "bg-red-100 text-red-600",         icon: <AlertCircle className="size-3" /> },
};

const CHANNEL_EMOJI: Record<string, string> = {
  shopify:    "🛍️",
  amazon:     "📦",
  ebay:       "🏷️",
  woocommerce:"🛒",
  etsy:       "🎨",
};

export default function ChannelPage() {
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Channel</h1>
          <p className="text-sm text-muted-foreground">
            Connect and manage all your sales channels in one place.
          </p>
        </div>
        <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#b8e87a] transition-colors">
          <Plus className="size-3.5" />
          Add Channel
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {CHANNEL_STATS.map((s) => (
          <div key={s.label} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-border">
            <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
            <div className="mt-3 flex items-end justify-between gap-2">
              <p className="text-2xl font-bold text-gray-900 leading-none">{s.value}</p>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${s.positive ? "bg-[#cdff8c]/30 text-[#4d7a00]" : "bg-red-100 text-red-600"}`}>
                {s.positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {Math.abs(s.change)}%
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{s.changeLabel}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Channels list */}
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-border overflow-hidden lg:col-span-2">
          <div className="border-b px-5 py-4">
            <p className="text-sm font-semibold text-gray-900">Connected Channels</p>
            <p className="text-xs text-muted-foreground">Manage your active sales channel integrations.</p>
          </div>
          <div className="divide-y divide-border">
            {CHANNELS.map((ch) => {
              const statusCfg = STATUS_CONFIG[ch.status];
              return (
                <div key={ch.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f1f7fa] text-xl">
                    {CHANNEL_EMOJI[ch.type]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-gray-900">{ch.name}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusCfg.className}`}>
                        {statusCfg.icon} {statusCfg.label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><ShoppingBag className="size-3" />{ch.orders.toLocaleString()} orders</span>
                      <span className="flex items-center gap-1"><TrendingUp className="size-3" />${ch.revenue.toLocaleString()}</span>
                      <span className="flex items-center gap-1"><Package className="size-3" />{ch.products} products</span>
                      <span className="flex items-center gap-1"><Clock className="size-3" />{ch.lastSync}</span>
                    </div>
                  </div>
                  <button className="flex shrink-0 items-center gap-1 text-xs font-medium text-[#4d7a00] hover:text-[#3d6000]">
                    Manage <ExternalLink className="size-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Revenue by channel chart */}
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-border">
          <p className="mb-1 text-sm font-semibold text-gray-900">Revenue by Channel</p>
          <p className="mb-4 text-xs text-muted-foreground">Total GMV breakdown</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={REVENUE_BY_CHANNEL} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} width={72} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Revenue"]} />
              <Bar dataKey="revenue" fill="#cdff8c" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* Quick stats below chart */}
          <div className="mt-4 space-y-2 border-t pt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Top channel</span>
              <span className="font-semibold text-gray-900">Shopify</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Fastest growing</span>
              <span className="font-semibold text-[#4d7a00]">WooCommerce ↑42%</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Needs attention</span>
              <span className="font-semibold text-red-600">Etsy (Error)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Add new channel cards */}
      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-border">
        <p className="mb-1 text-sm font-semibold text-gray-900">Add a New Channel</p>
        <p className="mb-4 text-xs text-muted-foreground">Connect more platforms to centralise all your sales.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { name: "TikTok Shop", emoji: "🎵" },
            { name: "Walmart",     emoji: "🏪" },
            { name: "Faire",       emoji: "🎁" },
            { name: "Custom API",  emoji: "🔌" },
          ].map((ch) => (
            <button
              key={ch.name}
              className="flex items-center gap-2.5 rounded-xl border border-dashed border-input px-4 py-3 text-left hover:border-[#cdff8c] hover:bg-[#cdff8c]/10 transition-colors group"
            >
              <span className="text-xl">{ch.emoji}</span>
              <div>
                <p className="text-xs font-medium text-gray-700 group-hover:text-gray-900">{ch.name}</p>
                <p className="text-[10px] text-muted-foreground">Connect</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
