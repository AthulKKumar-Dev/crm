import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShoppingBag, Package, Plus,
  ExternalLink, CheckCircle, AlertCircle, Clock, Search,
  ArrowRight, Store, Check, RefreshCw, Loader2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "~/components/ui/dialog";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { EmptyState } from "~/components/app/empty-state";
import { QueryErrorState } from "~/components/app/query-error-state";
import { ShopifyConnectDialog } from "~/components/app/shopify-connect-dialog";
import { WhatsAppConnectDialog } from "~/components/app/whatsapp-connect-dialog";
import { useChannels, channelKeys } from "~/hooks/use-channel-queries";
import { orgKeys } from "~/hooks/use-org-queries";
import { useTriggerSyncMutation, useDisconnectChannelMutation } from "~/hooks/use-channel-mutations";
import type { ChannelPlatform, ChannelStatus, SyncStatus } from "~/types/api";

export function meta() {
  return [{ title: "Channel | Collabo CRM" }];
}

/* ─── Visual config for channel status ────────────────────────── */

const STATUS_CONFIG: Record<ChannelStatus, { label: string; className: string; icon: React.ReactNode }> = {
  CONNECTED:    { label: "Connected",    className: "bg-[#CEF17B]/30 text-[#084734]", icon: <CheckCircle className="size-3" /> },
  SYNCING:      { label: "Syncing",      className: "bg-blue-100 text-blue-700",       icon: <Clock className="size-3" /> },
  ERROR:        { label: "Error",        className: "bg-red-100 text-red-600",         icon: <AlertCircle className="size-3" /> },
  DISCONNECTED: { label: "Disconnected", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", icon: <AlertCircle className="size-3" /> },
};

const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  IDLE: "Idle",
  IN_PROGRESS: "Syncing…",
  COMPLETED: "Synced",
  FAILED: "Sync failed",
};

const PLATFORM_EMOJI: Record<ChannelPlatform, string> = {
  SHOPIFY: "🛍️",
  WOOCOMMERCE: "🛒",
  INSTAGRAM: "📸",
  FACEBOOK: "👤",
  WHATSAPP: "💬",
  TIKTOK: "🎵",
  MANUAL: "📋",
};

const PLATFORM_LABEL: Record<ChannelPlatform, string> = {
  SHOPIFY: "Shopify",
  WOOCOMMERCE: "WooCommerce",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
  TIKTOK: "TikTok",
  MANUAL: "Manual",
};

function timeAgo(dateString: string | null): string {
  if (!dateString) return "Never";
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ─── Marketplace integration types and data ───────────────────── */

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  popular?: boolean;
  comingSoon?: boolean;
  features: string[];
}


const INTEGRATIONS: Integration[] = [
  {
    id: "shopify",
    name: "Shopify",
    description: "Sync products, orders, customers & inventory with your Shopify store in real-time. Automatic two-way sync keeps everything up to date.",
    icon: "🛍️",
    popular: true,
    features: ["Product sync", "Order management", "Inventory tracking", "Customer import"],
  },
  {
    id: "instagram-shop",
    name: "Instagram Shop",
    description: "Tag products in your posts & stories, manage orders from Instagram Shopping, and track social commerce performance.",
    icon: "📸",
    popular: true,
    features: ["Product tagging", "Order sync", "Shoppable posts", "Insights & analytics"],
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    description: "Engage customers directly via WhatsApp Business API. Send order updates, handle support queries, and drive conversions through chat.",
    icon: "💬",
    popular: true,
    features: ["Customer chat", "Order notifications", "Broadcast messages", "Quick replies"],
  },
];

/* ─── Channel page component ──────────────────────────────────── */

/** Maps callback error slugs from the server to human-readable messages. */
const SHOPIFY_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "The connection link expired — please try again.",
  cancelled: "Installation was cancelled in Shopify.",
  shop_taken: "This store is already connected to another organization.",
  invalid_hmac: "The request could not be verified. Please try again.",
  connect_failed: "Could not connect to Shopify. Please try again.",
};

export default function ChannelPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isShopifyDialogOpen, setIsShopifyDialogOpen] = useState(false);
  const [isWhatsAppDialogOpen, setIsWhatsAppDialogOpen] = useState(false);
  const [integrationSearch, setIntegrationSearch] = useState("");
  // Pre-fills the Shopify dialog when arriving from the embedded Shopify
  // app's "Open CRM" button (?install_shop=my-store.myshopify.com)
  const [installDomain, setInstallDomain] = useState<string | undefined>();

  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const { data: channels, isLoading, isError, refetch } = useChannels();
  const triggerSync = useTriggerSyncMutation();
  const disconnectChannel = useDisconnectChannelMutation();

  // Handle query params set by OAuth redirects and the embedded Shopify app
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    const installShop = searchParams.get("install_shop");

    if (connected) {
      toast.success(
        connected === "shopify"
          ? "Shopify store connected — initial sync started"
          : connected === "instagram"
            ? "Instagram account connected"
            : "Channel connected",
      );
      queryClient.invalidateQueries({ queryKey: channelKeys.all });
      // Org currency is auto-synced from the Shopify shop on connect
      queryClient.invalidateQueries({ queryKey: orgKeys.all });
      setSearchParams({}, { replace: true });
    } else if (error === "shopify_connect_failed") {
      const reason = searchParams.get("reason") ?? "connect_failed";
      toast.error(SHOPIFY_ERROR_MESSAGES[reason] ?? SHOPIFY_ERROR_MESSAGES.connect_failed);
      setSearchParams({}, { replace: true });
    } else if (installShop) {
      setInstallDomain(installShop);
      setIsShopifyDialogOpen(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const filteredIntegrations = INTEGRATIONS.filter((integration) => {
    return !integrationSearch || integration.name.toLowerCase().includes(integrationSearch.toLowerCase()) || integration.description.toLowerCase().includes(integrationSearch.toLowerCase());
  });

  const connectedPlatforms = new Set((channels ?? []).map((ch) => ch.platform.toLowerCase()));

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Channel</h1>
          <p className="text-sm text-muted-foreground">
            Connect and manage all your sales channels in one place.
          </p>
        </div>
        <button
          onClick={() => setIsDialogOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#CEF17B] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#BADE6F] transition-colors"
        >
          <Plus className="size-3.5" />
          Add Channel
        </button>
      </div>

      {/* Connected channels list */}
      {/* Error first, and deliberately so: this page's empty state offers an
          "Add Channel" button, so rendering it on a failed request invited the
          merchant to connect a store they had already connected. */}
      {isError && !channels ? (
        <QueryErrorState resource="your channels" onRetry={() => refetch()} />
      ) : isLoading ? (
        <TableSkeleton rows={4} columns={4} />
      ) : !channels || channels.length === 0 ? (
        <EmptyState
          title="No channels connected"
          description="Connect a sales channel to start syncing your products, orders, and customers."
          action={
            <button
              onClick={() => setIsDialogOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#CEF17B] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#BADE6F]"
            >
              <Plus className="size-3.5" />
              Add Channel
            </button>
          }
        />
      ) : (
        <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border overflow-hidden">
          <div className="border-b px-5 py-4">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Connected Channels</p>
            <p className="text-xs text-muted-foreground">Manage your active sales channel integrations.</p>
          </div>
          <div className="divide-y divide-border">
            {channels.map((channel) => {
              const statusConfig = STATUS_CONFIG[channel.status];
              return (
                <div key={channel.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f1f7fa] dark:bg-gray-800/60 text-xl">
                    {PLATFORM_EMOJI[channel.platform] ?? "📦"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{channel.name}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusConfig.className}`}>
                        {statusConfig.icon} {statusConfig.label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Package className="size-3" />{PLATFORM_LABEL[channel.platform]}</span>
                      <span className="flex items-center gap-1"><ShoppingBag className="size-3" />{SYNC_STATUS_LABEL[channel.syncStatus]}</span>
                      <span className="flex items-center gap-1"><Clock className="size-3" />{timeAgo(channel.lastSyncedAt)}</span>
                      {channel.externalStoreUrl && (
                        <a href={channel.externalStoreUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[#084734] hover:underline">
                          <ExternalLink className="size-3" />{channel.externalStoreUrl}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Reconnect: shown when the store's token is dead
                        (app uninstalled from Shopify / auth revoked).
                        Re-opens the connect dialog — the server updates the
                        existing channel row instead of creating a new one. */}
                    {channel.platform === 'SHOPIFY' && channel.status === 'DISCONNECTED' && (
                      <button
                        onClick={() => {
                          setInstallDomain(
                            channel.externalStoreUrl?.replace(/^https?:\/\//, "") || undefined,
                          );
                          setIsShopifyDialogOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#CEF17B] px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-[#BADE6F] transition-colors"
                      >
                        <RefreshCw className="size-3" />
                        Reconnect
                      </button>
                    )}
                    {/* Sync button:
                        • SHOPIFY  → "Sync Now"        (pull from Shopify + bulk-push local items)
                        • MANUAL   → "Push to Shopify" (no pull; bulk-push products/orders/drafts created in the CRM)
                        • Others   → hidden            (no push/pull semantics for IG/WA in this queue) */}
                    {(channel.platform === 'SHOPIFY' || channel.platform === 'MANUAL') && (
                      <button
                        onClick={() => triggerSync.mutate({
                          id: channel.id,
                          // 'locations' first: it mirrors Shopify locations as warehouses, and
                            // the inventory pass reconciles per-location stock into them.
                            data: { entityTypes: ['locations', 'products', 'orders', 'customers', 'inventory'] },
                        })}
                        // Only block on the local mutation being mid-flight.
                        // We deliberately do NOT block on `syncStatus === IN_PROGRESS`:
                        // the server self-heals stuck rows when the trigger fires
                        // again, so allowing re-clicks is the recovery path.
                        disabled={triggerSync.isPending}
                        title={
                          channel.platform === 'MANUAL'
                            ? 'Push every CRM-created product, offline order and draft to your connected Shopify store.'
                            : 'Pull latest data from Shopify and push any unsynced local items.'
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                      >
                        {channel.syncStatus === 'IN_PROGRESS' || triggerSync.isPending ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3" />
                        )}
                        {triggerSync.isPending
                          ? 'Starting…'
                          : channel.syncStatus === 'IN_PROGRESS'
                            ? 'Syncing… click to retry'
                            : channel.platform === 'MANUAL'
                              ? 'Push to Shopify'
                              : 'Sync Now'}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to disconnect this channel?')) {
                          disconnectChannel.mutate(channel.id);
                        }
                      }}
                      className="text-xs text-muted-foreground hover:text-red-600 transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Add Channel dialog (marketplace integrations) ─────────── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[#CEF17B]/30">
                <Store className="size-4 text-[#084734]" />
              </div>
              Add a Channel
            </DialogTitle>
            <DialogDescription>
              Connect a marketplace, platform or service to centralize your operations.
            </DialogDescription>

            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 dark:text-gray-400" />
              <input
                type="text"
                placeholder="Search integrations..."
                value={integrationSearch}
                onChange={(event) => setIntegrationSearch(event.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 pl-9 pr-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 shadow-sm outline-none transition focus:border-[#CEF17B] focus:ring-2 focus:ring-[#CEF17B]/40"
              />
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <IntegrationGrid
              integrations={filteredIntegrations}
              connectedPlatforms={connectedPlatforms}
              onConnect={(integrationId) => {
                  setIsDialogOpen(false);
                  if (integrationId === "shopify") setIsShopifyDialogOpen(true);
                  if (integrationId === "whatsapp") setIsWhatsAppDialogOpen(true);
                }}
            />
          </div>

          <div className="border-t px-6 py-3 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
            <p className="text-[11px] text-muted-foreground">
              {filteredIntegrations.length} integration{filteredIntegrations.length !== 1 ? "s" : ""} available
            </p>
            <p className="text-[11px] text-muted-foreground">
              Don't see what you need?{" "}
              <button className="text-[#084734] font-medium hover:underline">Request integration</button>
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shopify connect dialog (public-app OAuth + advanced custom-app fallback) */}
      <ShopifyConnectDialog
        open={isShopifyDialogOpen}
        onOpenChange={(open) => {
          setIsShopifyDialogOpen(open);
          if (!open) setInstallDomain(undefined);
        }}
        initialDomain={installDomain}
      />

      {/* WhatsApp Embedded Signup dialog */}
      <WhatsAppConnectDialog
        open={isWhatsAppDialogOpen}
        onOpenChange={setIsWhatsAppDialogOpen}
      />
    </div>
  );
}

/* ─── Integration grid sub-component ───────────────────────────── */

function IntegrationGrid({
  integrations,
  connectedPlatforms,
  onConnect,
}: {
  integrations: Integration[];
  connectedPlatforms: Set<string>;
  onConnect: (integrationId: string) => void;
}) {
  if (integrations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <Search className="size-8 text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No integrations found</p>
        <p className="text-xs text-muted-foreground mt-1">Try a different search term or category</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-4">
      {integrations.map((integration) => {
        const isConnected = connectedPlatforms.has(integration.id);
        return (
          <button
            key={integration.id}
            disabled={integration.comingSoon}
            onClick={() => {
              if (!integration.comingSoon && !isConnected) {
                onConnect(integration.id);
              }
            }}
            className={`group relative flex flex-col rounded-xl border p-5 text-left transition-all ${
              integration.comingSoon
                ? "border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-default opacity-70"
                : isConnected
                ? "border-[#CEF17B] bg-[#CEF17B]/10 cursor-default"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-[#CEF17B] hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
            }`}
          >
            <div className="flex items-start gap-4 w-full">
              <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl ${
                isConnected ? "bg-[#CEF17B]/30" : "bg-[#f1f7fa] dark:bg-gray-800/60"
              }`}>
                {integration.icon}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{integration.name}</p>
                  {isConnected && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-[#CEF17B]/40 px-1.5 py-0.5 text-[9px] font-semibold text-[#084734]">
                      <CheckCircle className="size-2.5" /> Connected
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {integration.description}
                </p>
              </div>

              {!isConnected && !integration.comingSoon && (
                <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-400 transition-all group-hover:bg-[#CEF17B] group-hover:text-gray-900">
                  <ArrowRight className="size-4" />
                </div>
              )}
            </div>

            {/* Feature list */}
            <div className="mt-3 flex flex-wrap gap-2 pl-16">
              {integration.features.map((feature) => (
                <span key={feature} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:text-gray-400">
                  <Check className="size-3 text-[#084734]" />
                  {feature}
                </span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
