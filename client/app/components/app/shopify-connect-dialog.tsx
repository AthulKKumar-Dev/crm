import { useEffect, useState } from "react";
import {
  Loader2, ShoppingBag, Eye, EyeOff, ExternalLink,
  ChevronDown, ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";
import {
  useInstallShopifyMutation,
  useManualConnectShopifyMutation,
} from "~/hooks/use-channel-mutations";

interface ShopifyConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled when the merchant arrives from the embedded Shopify app (?install_shop=). */
  initialDomain?: string;
}

/**
 * Dialog for connecting a Shopify store.
 *
 * Primary path: public-app OAuth — the merchant enters their store domain
 * and is redirected to Shopify to approve the install; tokens are captured
 * server-side, no credentials ever pass through the browser.
 *
 * Fallback (collapsed "Advanced" section): the legacy custom-app credential
 * paste, for stores that can't install the public app.
 */
export function ShopifyConnectDialog({ open, onOpenChange, initialDomain }: ShopifyConnectDialogProps) {
  const [shopDomain, setShopDomain] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Legacy custom-app credentials (Advanced section only)
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const install = useInstallShopifyMutation();
  const manualConnect = useManualConnectShopifyMutation();

  useEffect(() => {
    if (open && initialDomain) {
      setShopDomain(initialDomain.replace(/\.myshopify\.com$/i, ""));
    }
  }, [open, initialDomain]);

  function handleInstall() {
    if (!shopDomain.trim()) return;
    // Server normalizes authoritatively ("my-store" / full domain / URL all work)
    install.mutate({ shopDomain: shopDomain.trim() });
  }

  function handleManualConnect() {
    let domain = shopDomain.trim();
    domain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\/admin.*$/, "");
    if (!domain.includes(".myshopify.com")) {
      domain = `${domain}.myshopify.com`;
    }

    if (!domain || !apiKey.trim() || !apiSecret.trim() || !accessToken.trim()) return;

    manualConnect.mutate(
      {
        shopDomain: domain,
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        accessToken: accessToken.trim(),
      },
      {
        onSuccess: () => {
          setShopDomain("");
          setApiKey("");
          setApiSecret("");
          setAccessToken("");
          onOpenChange(false);
        },
      },
    );
  }

  const isManualFormValid = shopDomain.trim() && apiKey.trim() && apiSecret.trim() && accessToken.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[#96bf48]/20">
              <ShoppingBag className="size-4 text-[#96bf48]" />
            </div>
            Connect Shopify Store
          </DialogTitle>
          <DialogDescription>
            Enter your store domain — you&apos;ll be redirected to Shopify to approve the connection.
          </DialogDescription>
        </DialogHeader>

        {/* ── Primary: public-app OAuth install ── */}
        <div className="space-y-3 py-1">
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Store domain <span className="text-red-500">*</span>
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInstall()}
                placeholder="my-store"
                className="flex-1 rounded-lg border bg-white dark:bg-gray-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#CEF17B]/50 placeholder:text-gray-400"
              />
              <span className="shrink-0 text-xs text-muted-foreground">.myshopify.com</span>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
            <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-1">What happens next:</p>
            <ol className="space-y-0.5 text-[10px] text-muted-foreground list-decimal list-inside">
              <li>You&apos;ll be redirected to Shopify to review and approve the app</li>
              <li>After approval you&apos;ll land back here, connected</li>
              <li>Products, orders, and customers start syncing automatically</li>
            </ol>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleInstall}
              disabled={install.isPending || !shopDomain.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#CEF17B] px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-[#BADE6F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {install.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Redirecting to Shopify…
                </>
              ) : (
                <>
                  Install &amp; Connect
                  <ExternalLink className="size-3.5" />
                </>
              )}
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* ── Advanced: legacy custom-app credentials (de-emphasized) ── */}
        <div className="border-t pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            Advanced: connect with a custom app instead
          </button>

          {showAdvanced && (
            <div className="space-y-3 pt-3">
              {/* Setup instructions */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-4">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">How to get your credentials:</p>
                <ol className="space-y-1.5 text-[11px] text-amber-700 dark:text-amber-400 list-decimal list-inside">
                  <li>Go to Shopify Admin → <strong>Settings</strong> → <strong>Apps and sales channels</strong></li>
                  <li>Click <strong>Develop apps</strong> → <strong>Allow custom app development</strong></li>
                  <li>Click <strong>Create an app</strong> → name it (e.g., "Collabo CRM")</li>
                  <li>Go to <strong>Configuration</strong> → <strong>Admin API integration</strong> → select scopes:
                    <span className="block mt-0.5 font-mono text-[10px] bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                      read_products, read_orders, read_customers, read_inventory
                    </span>
                  </li>
                  <li>Save the configuration, then click <strong>Install app</strong> and confirm</li>
                  <li>Go to <strong>API credentials</strong> tab → copy <strong>API key</strong> and <strong>API secret key</strong></li>
                  <li>Under <strong>Admin API access token</strong>, click <strong>Reveal token once</strong> and copy it
                    <span className="block mt-0.5 text-[10px] text-amber-600 dark:text-amber-500 font-medium">
                      This token is only shown once — save it somewhere safe!
                    </span>
                  </li>
                </ol>
              </div>

              {/* API Key */}
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">API Key <span className="text-red-500">*</span></label>
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="From your custom app's API credentials tab"
                  className="mt-1 w-full rounded-lg border bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-[#CEF17B]/50 placeholder:text-gray-400"
                />
              </div>

              {/* API Secret */}
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">API Secret Key <span className="text-red-500">*</span></label>
                <div className="relative mt-1">
                  <input
                    type={showSecret ? "text" : "password"}
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder="shpss_xxxxxxxxxxxxxxxxxxxxx"
                    className="w-full rounded-lg border bg-white dark:bg-gray-800 px-3 py-2 pr-10 text-sm font-mono outline-none focus:ring-2 focus:ring-[#CEF17B]/50 placeholder:text-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>

              {/* Admin API Access Token */}
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Admin API Access Token <span className="text-red-500">*</span></label>
                <div className="relative mt-1">
                  <input
                    type={showToken ? "text" : "password"}
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="shpat_xxxxxxxxxxxxxxxxxxxxx"
                    className="w-full rounded-lg border bg-white dark:bg-gray-800 px-3 py-2 pr-10 text-sm font-mono outline-none focus:ring-2 focus:ring-[#CEF17B]/50 placeholder:text-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>

              <button
                onClick={handleManualConnect}
                disabled={manualConnect.isPending || !isManualFormValid}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-input bg-white dark:bg-gray-900 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {manualConnect.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect with custom app credentials"
                )}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
