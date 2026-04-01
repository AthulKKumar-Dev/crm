import { useState } from "react";
import {
  ShoppingBag, Globe, Package, TrendingUp, TrendingDown, Plus,
  ExternalLink, CheckCircle, AlertCircle, Clock, Search,
  ArrowRight, Star, Zap, ShoppingCart, Store, Smartphone,
  CreditCard, MessageSquare, BarChart3, Truck, FileText,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "~/components/ui/dialog";

export function meta() {
  return [{ title: "Channel | Collabo CRM" }];
}

/* ─── Data ──────────────────────────────────────────────────────── */

const CHANNEL_STATS = [
  { label: "Active Channels",   value: "5",        change: 1,   positive: true,  changeLabel: "vs last month" },
  { label: "Total GMV",         value: "$284,910",  change: 31,  positive: true,  changeLabel: "vs last month" },
  { label: "Channel Orders",    value: "4,821",     change: 18,  positive: true,  changeLabel: "vs last month" },
  { label: "Sync Errors",       value: "3",         change: -60, positive: true,  changeLabel: "vs last month" },
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
  { id: "1", name: "Shopify Store",      type: "shopify",     status: "CONNECTED", orders: 1842, revenue: 128400, products: 284, lastSync: "2 min ago" },
  { id: "2", name: "Amazon Seller",      type: "amazon",      status: "CONNECTED", orders: 1204, revenue: 84200,  products: 96,  lastSync: "5 min ago" },
  { id: "3", name: "eBay Store",         type: "ebay",        status: "SYNCING",   orders: 621,  revenue: 32800,  products: 142, lastSync: "Syncing…" },
  { id: "4", name: "WooCommerce",        type: "woocommerce", status: "CONNECTED", orders: 890,  revenue: 29400,  products: 211, lastSync: "12 min ago" },
  { id: "5", name: "Etsy Shop",          type: "etsy",        status: "ERROR",     orders: 264,  revenue: 10110,  products: 58,  lastSync: "Failed — 1h ago" },
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
  shopify:     "🛍️",
  amazon:      "📦",
  ebay:        "🏷️",
  woocommerce: "🛒",
  etsy:        "🎨",
};

/* ─── Marketplace Integrations ──────────────────────────────────── */

type IntegrationCategory =
  | "marketplace"
  | "ecommerce"
  | "social"
  | "payment"
  | "shipping"
  | "messaging"
  | "analytics"
  | "accounting";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;         // emoji
  category: IntegrationCategory;
  popular?: boolean;
  comingSoon?: boolean;
}

const CATEGORIES: { value: IntegrationCategory | "all"; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "all",         label: "All",          icon: Globe },
  { value: "marketplace", label: "Marketplaces",  icon: Store },
  { value: "ecommerce",   label: "E-Commerce",    icon: ShoppingCart },
  { value: "social",      label: "Social Commerce",icon: Smartphone },
  { value: "payment",     label: "Payments",       icon: CreditCard },
  { value: "shipping",    label: "Shipping",       icon: Truck },
  { value: "messaging",   label: "Messaging",      icon: MessageSquare },
  { value: "analytics",   label: "Analytics",      icon: BarChart3 },
  { value: "accounting",  label: "Accounting",     icon: FileText },
];

const INTEGRATIONS: Integration[] = [
  // Marketplaces
  { id: "shopify",       name: "Shopify",          description: "Sync products, orders & inventory with your Shopify store",                   icon: "🛍️", category: "marketplace", popular: true },
  { id: "amazon",        name: "Amazon",           description: "Connect your Amazon Seller account for unified order management",             icon: "📦", category: "marketplace", popular: true },
  { id: "ebay",          name: "eBay",             description: "List products and manage eBay auctions & orders",                            icon: "🏷️", category: "marketplace" },
  { id: "etsy",          name: "Etsy",             description: "Sync your handmade & vintage shop with Collabo",                             icon: "🎨", category: "marketplace" },
  { id: "walmart",       name: "Walmart",          description: "Sell on Walmart Marketplace with real-time inventory sync",                  icon: "🏪", category: "marketplace" },
  { id: "tiktok-shop",   name: "TikTok Shop",      description: "Manage TikTok Shop orders and product listings",                             icon: "🎵", category: "marketplace", popular: true },
  { id: "faire",         name: "Faire",            description: "Wholesale marketplace — sync your B2B catalog",                              icon: "🎁", category: "marketplace" },
  { id: "mercado-libre", name: "Mercado Libre",    description: "Latin America's largest marketplace integration",                            icon: "🌎", category: "marketplace", comingSoon: true },

  // E-Commerce
  { id: "woocommerce",   name: "WooCommerce",      description: "WordPress-powered store with full product & order sync",                     icon: "🛒", category: "ecommerce", popular: true },
  { id: "magento",       name: "Magento",          description: "Adobe Commerce / Magento 2 bi-directional sync",                             icon: "🔶", category: "ecommerce" },
  { id: "bigcommerce",   name: "BigCommerce",      description: "Headless-ready commerce platform integration",                               icon: "🏬", category: "ecommerce" },
  { id: "squarespace",   name: "Squarespace",      description: "Sync products and orders from your Squarespace site",                        icon: "⬛", category: "ecommerce" },
  { id: "wix",           name: "Wix eCommerce",    description: "Connect your Wix online store",                                              icon: "🌐", category: "ecommerce" },
  { id: "prestashop",    name: "PrestaShop",       description: "Open-source e-commerce platform integration",                                icon: "🔵", category: "ecommerce", comingSoon: true },

  // Social Commerce
  { id: "instagram-shop",name: "Instagram Shop",   description: "Tag products & manage orders from Instagram Shopping",                       icon: "📸", category: "social", popular: true },
  { id: "facebook-shop", name: "Facebook Shop",    description: "Sync your Facebook Commerce catalog & orders",                               icon: "👤", category: "social" },
  { id: "pinterest",     name: "Pinterest",        description: "Product pins & buyable pins integration",                                    icon: "📌", category: "social" },
  { id: "google-shop",   name: "Google Shopping",  description: "Manage your Google Merchant Center product feed",                            icon: "🔍", category: "social" },
  { id: "youtube-shop",  name: "YouTube Shopping",  description: "Sell products through your YouTube channel",                                 icon: "▶️",  category: "social", comingSoon: true },

  // Payments
  { id: "stripe",        name: "Stripe",           description: "Accept payments and manage subscriptions",                                   icon: "💳", category: "payment", popular: true },
  { id: "paypal",        name: "PayPal",           description: "PayPal checkout, invoicing & payment tracking",                              icon: "🅿️", category: "payment" },
  { id: "square",        name: "Square",           description: "POS & online payment processing",                                            icon: "⬜", category: "payment" },
  { id: "klarna",        name: "Klarna",           description: "Buy now, pay later — split payment integration",                             icon: "💗", category: "payment" },
  { id: "razorpay",      name: "Razorpay",         description: "Payment gateway for Indian market",                                          icon: "💙", category: "payment", comingSoon: true },

  // Shipping
  { id: "shipstation",   name: "ShipStation",      description: "Multi-carrier shipping automation & label printing",                         icon: "🚢", category: "shipping" },
  { id: "shippo",        name: "Shippo",           description: "Discounted shipping rates & tracking across carriers",                       icon: "📬", category: "shipping" },
  { id: "fedex",         name: "FedEx",            description: "Direct FedEx rate shopping & tracking integration",                           icon: "🟣", category: "shipping" },
  { id: "dhl",           name: "DHL",              description: "International shipping with DHL Express",                                    icon: "🟡", category: "shipping" },
  { id: "ups",           name: "UPS",              description: "UPS shipping rates, labels & package tracking",                               icon: "🟤", category: "shipping", comingSoon: true },

  // Messaging
  { id: "whatsapp",      name: "WhatsApp Business", description: "Customer conversations via WhatsApp Business API",                          icon: "💬", category: "messaging", popular: true },
  { id: "intercom",      name: "Intercom",          description: "Live chat & customer messaging platform",                                   icon: "💭", category: "messaging" },
  { id: "zendesk",       name: "Zendesk",           description: "Help desk & customer support ticket sync",                                  icon: "🎫", category: "messaging" },
  { id: "slack",         name: "Slack",             description: "Get order & inventory alerts in Slack channels",                             icon: "💡", category: "messaging" },
  { id: "telegram",      name: "Telegram Bot",      description: "Receive notifications & manage orders via Telegram",                        icon: "✈️",  category: "messaging", comingSoon: true },

  // Analytics
  { id: "google-analytics",name: "Google Analytics", description: "Track e-commerce events & conversion funnels",                             icon: "📊", category: "analytics" },
  { id: "meta-pixel",     name: "Meta Pixel",        description: "Facebook/Instagram conversion tracking & audiences",                       icon: "🔷", category: "analytics" },
  { id: "hotjar",         name: "Hotjar",            description: "Heatmaps & session recordings for your storefront",                        icon: "🔥", category: "analytics" },
  { id: "mixpanel",       name: "Mixpanel",          description: "Product analytics & user behavior tracking",                               icon: "🧪", category: "analytics", comingSoon: true },

  // Accounting
  { id: "quickbooks",    name: "QuickBooks",       description: "Sync orders, refunds & payouts to QuickBooks",                               icon: "📗", category: "accounting" },
  { id: "xero",          name: "Xero",             description: "Automated bookkeeping & invoice sync",                                       icon: "📘", category: "accounting" },
  { id: "zoho-books",    name: "Zoho Books",       description: "Accounting integration for Zoho ecosystem",                                  icon: "📕", category: "accounting", comingSoon: true },
];

/* ─── Component ─────────────────────────────────────────────────── */

export default function ChannelPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch]         = useState("");
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | "all">("all");

  const filteredIntegrations = INTEGRATIONS.filter((i) => {
    const matchesCategory = activeCategory === "all" || i.category === activeCategory;
    const matchesSearch   = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Already connected channel types
  const connectedTypes = new Set(CHANNELS.map((ch) => ch.type));

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
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#b8e87a] transition-colors"
        >
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

      {/* ── Add Channel Dialog (Marketplace) ────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[#cdff8c]/30">
                <Store className="size-4 text-[#4d7a00]" />
              </div>
              Add a Channel
            </DialogTitle>
            <DialogDescription>
              Connect a marketplace, platform or service to centralize your operations.
            </DialogDescription>

            {/* Search */}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search integrations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus:border-[#cdff8c] focus:ring-2 focus:ring-[#cdff8c]/40"
              />
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="flex flex-1 min-h-0">
            {/* Category sidebar */}
            <div className="w-44 shrink-0 border-r bg-gray-50/50 py-3 overflow-y-auto hidden sm:block">
              {CATEGORIES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => { setActiveCategory(value); setSearch(""); }}
                  className={`flex w-full items-center gap-2 px-4 py-2 text-xs font-medium transition-colors ${
                    activeCategory === value
                      ? "bg-[#cdff8c]/20 text-[#4d7a00] border-r-2 border-[#4d7a00]"
                      : "text-gray-500 hover:text-gray-800 hover:bg-gray-100/70"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Mobile category pills */}
            <div className="sm:hidden w-full flex flex-col">
              <div className="flex gap-1.5 overflow-x-auto px-4 py-3 border-b">
                {CATEGORIES.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => { setActiveCategory(value); setSearch(""); }}
                    className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                      activeCategory === value
                        ? "bg-[#cdff8c] text-gray-900"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <IntegrationGrid
                integrations={filteredIntegrations}
                connectedTypes={connectedTypes}
                onConnect={() => setDialogOpen(false)}
              />
            </div>

            {/* Desktop grid */}
            <div className="hidden sm:block flex-1 overflow-y-auto">
              <IntegrationGrid
                integrations={filteredIntegrations}
                connectedTypes={connectedTypes}
                onConnect={() => setDialogOpen(false)}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="border-t px-6 py-3 flex items-center justify-between bg-gray-50/50">
            <p className="text-[11px] text-muted-foreground">
              {filteredIntegrations.length} integration{filteredIntegrations.length !== 1 ? "s" : ""} available
            </p>
            <p className="text-[11px] text-muted-foreground">
              Don't see what you need?{" "}
              <button className="text-[#4d7a00] font-medium hover:underline">Request integration</button>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Integration Grid ──────────────────────────────────────────── */

function IntegrationGrid({
  integrations,
  connectedTypes,
  onConnect,
}: {
  integrations: Integration[];
  connectedTypes: Set<string>;
  onConnect: () => void;
}) {
  if (integrations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <Search className="size-8 text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-500">No integrations found</p>
        <p className="text-xs text-muted-foreground mt-1">Try a different search term or category</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
      {integrations.map((integration) => {
        const isConnected = connectedTypes.has(integration.id);
        return (
          <button
            key={integration.id}
            disabled={integration.comingSoon}
            onClick={() => {
              if (!integration.comingSoon && !isConnected) {
                // In a real app this would navigate to an auth/setup flow
                onConnect();
              }
            }}
            className={`group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
              integration.comingSoon
                ? "border-dashed border-gray-200 bg-gray-50/50 cursor-default opacity-70"
                : isConnected
                ? "border-[#cdff8c] bg-[#cdff8c]/10 cursor-default"
                : "border-gray-200 bg-white hover:border-[#cdff8c] hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
            }`}
          >
            {/* Popular badge */}
            {integration.popular && !isConnected && (
              <span className="absolute -top-2 right-3 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">
                <Star className="size-2.5 fill-amber-500 text-amber-500" /> Popular
              </span>
            )}

            {/* Icon */}
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-xl ${
              isConnected ? "bg-[#cdff8c]/30" : "bg-[#f1f7fa]"
            }`}>
              {integration.icon}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900">{integration.name}</p>
                {isConnected && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[#cdff8c]/40 px-1.5 py-0.5 text-[9px] font-semibold text-[#4d7a00]">
                    <CheckCircle className="size-2.5" /> Connected
                  </span>
                )}
                {integration.comingSoon && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] font-semibold text-gray-500">
                    <Clock className="size-2.5" /> Soon
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                {integration.description}
              </p>
            </div>

            {/* Connect arrow */}
            {!isConnected && !integration.comingSoon && (
              <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400 transition-all group-hover:bg-[#cdff8c] group-hover:text-gray-900">
                <ArrowRight className="size-3.5" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
