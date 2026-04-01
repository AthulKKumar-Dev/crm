import { useState } from "react";
import { Plus, Send, Mail, Smartphone, BarChart2, Users, Eye, MousePointer, TrendingUp, TrendingDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

export function meta() {
  return [{ title: "Marketing | Collabo CRM" }];
}

const CAMPAIGN_STATS = [
  { label: "Active Campaigns", value: "12",     change: 3,   changeLabel: "vs last month", positive: true },
  { label: "Emails Sent",      value: "48,291", change: 22,  changeLabel: "vs last month", positive: true },
  { label: "Avg. Open Rate",   value: "28.4%",  change: -3,  changeLabel: "vs last month", positive: false },
  { label: "Conversions",      value: "1,842",  change: 17,  changeLabel: "vs last month", positive: true },
];

const CAMPAIGNS = [
  { id: "1", name: "January Flash Sale",      type: "email",   status: "SENT",    sent: 12400, opens: 3844, clicks: 921,  conversions: 184 },
  { id: "2", name: "New Year Welcome Series", type: "email",   status: "ACTIVE",  sent: 5200,  opens: 1768, clicks: 412,  conversions: 86 },
  { id: "3", name: "Re-engagement SMS Blast", type: "sms",     status: "ACTIVE",  sent: 3800,  opens: 3610, clicks: 720,  conversions: 144 },
  { id: "4", name: "VIP Customer Promo",       type: "email",   status: "DRAFT",   sent: 0,     opens: 0,    clicks: 0,    conversions: 0 },
  { id: "5", name: "Abandoned Cart Recovery",  type: "email",   status: "ACTIVE",  sent: 8900,  opens: 2847, clicks: 710,  conversions: 213 },
  { id: "6", name: "Product Launch — AW S10",  type: "push",    status: "SENT",    sent: 22000, opens: 6600, clicks: 1540, conversions: 308 },
];

const ENGAGEMENT_DATA = [
  { month: "Jul", opens: 24, clicks: 8 },
  { month: "Aug", opens: 28, clicks: 10 },
  { month: "Sep", opens: 22, clicks: 7 },
  { month: "Oct", opens: 31, clicks: 13 },
  { month: "Nov", opens: 27, clicks: 11 },
  { month: "Dec", opens: 34, clicks: 15 },
  { month: "Jan", opens: 28, clicks: 12 },
];

const CHANNEL_DATA = [
  { name: "Email",     campaigns: 8, conversions: 420 },
  { name: "SMS",       campaigns: 2, conversions: 144 },
  { name: "Push",      campaigns: 1, conversions: 308 },
  { name: "In-App",    campaigns: 1, conversions: 96 },
];

type CampaignStatus = "ACTIVE" | "SENT" | "DRAFT" | "PAUSED";

const STATUS_CLASS: Record<CampaignStatus, string> = {
  ACTIVE: "bg-[#cdff8c]/30 text-[#4d7a00]",
  SENT:   "bg-blue-100 text-blue-700",
  DRAFT:  "bg-gray-100 text-gray-500",
  PAUSED: "bg-orange-100 text-orange-600",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  email: <Mail className="size-3.5 text-blue-500" />,
  sms:   <Smartphone className="size-3.5 text-orange-500" />,
  push:  <BarChart2 className="size-3.5 text-purple-500" />,
};

export default function MarketingPage() {
  const [tab, setTab] = useState<"campaigns" | "analytics">("campaigns");

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Marketing</h1>
          <p className="text-sm text-muted-foreground">
            Manage campaigns, track engagement, and grow your audience.
          </p>
        </div>
        <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#b8e87a] transition-colors">
          <Plus className="size-3.5" />
          New Campaign
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {CAMPAIGN_STATS.map((s) => (
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

      {/* Tab bar */}
      <div className="flex gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-border w-fit">
        {(["campaigns", "analytics"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium capitalize transition-colors ${
              tab === t ? "bg-[#cdff8c] text-gray-900" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Campaigns tab */}
      {tab === "campaigns" && (
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/60 text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-muted-foreground">Campaign</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Sent</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Opens</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Clicks</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Conversions</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {CAMPAIGNS.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-xs font-medium text-gray-900">{c.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {TYPE_ICON[c.type]}
                        <span className="text-xs text-muted-foreground capitalize">{c.type}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-900 text-right font-medium">{c.sent.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-medium text-gray-900">{c.opens.toLocaleString()}</span>
                        {c.sent > 0 && <span className="text-[10px] text-muted-foreground">{((c.opens / c.sent) * 100).toFixed(1)}%</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-medium text-gray-900">{c.clicks.toLocaleString()}</span>
                        {c.opens > 0 && <span className="text-[10px] text-muted-foreground">{((c.clicks / c.opens) * 100).toFixed(1)}%</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#4d7a00] text-right">{c.conversions.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[c.status as CampaignStatus]}`}>
                        {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Analytics tab */}
      {tab === "analytics" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-border">
            <p className="mb-1 text-sm font-semibold text-gray-900">Email Engagement Rate</p>
            <p className="mb-4 text-xs text-muted-foreground">Open rate vs click rate over time</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={ENGAGEMENT_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Line type="monotone" dataKey="opens"  name="Open Rate"  stroke="#cdff8c" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="clicks" name="Click Rate" stroke="#fb923c" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-border">
            <p className="mb-1 text-sm font-semibold text-gray-900">Conversions by Channel</p>
            <p className="mb-4 text-xs text-muted-foreground">Which channels drive the most conversions</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={CHANNEL_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Bar dataKey="conversions" name="Conversions" fill="#cdff8c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
