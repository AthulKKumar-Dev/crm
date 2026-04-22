import { useState } from "react";
import { Loader2, MessageCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";
import {
  useWhatsAppInstallMutation,
  useCompleteWhatsAppInstallMutation,
} from "~/hooks/use-whatsapp-mutations";

interface WhatsAppConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog that kicks off Meta's WhatsApp Embedded Signup flow.
 *
 * Flow:
 *   1. Click "Continue with Meta" → backend returns { configId, state }.
 *   2. Launch FB.login popup with that configId — merchant picks/creates
 *      their WABA + phone number inside Meta's UI.
 *   3. Meta returns a short-lived `code` to the popup callback.
 *   4. Forward { code, state } to the backend, which exchanges the code for
 *      a long-lived token, reads the WABA + phone number IDs, and creates
 *      the Channel row.
 */
export function WhatsAppConnectDialog({ open, onOpenChange }: WhatsAppConnectDialogProps) {
  const [launching, setLaunching] = useState(false);

  const startInstall = useWhatsAppInstallMutation();
  const completeInstall = useCompleteWhatsAppInstallMutation();

  /**
   * Ensures window.FB is available — loads the SDK on-demand if it hasn't
   * been loaded yet (e.g., user clicked before MetaSdkInit finished, or
   * VITE_META_APP_ID wasn't set at root mount).
   */
  async function ensureSdk(): Promise<boolean> {
    if (window.FB) return true;

    const appId = import.meta.env.VITE_META_APP_ID;
    if (!appId) {
      toast.error(
        "VITE_META_APP_ID is missing from client environment. Set it in .env and restart the dev server.",
      );
      return false;
    }

    return new Promise((resolve) => {
      window.fbAsyncInit = () => {
        window.FB?.init({ appId, cookie: true, xfbml: false, version: "v21.0" });
        resolve(true);
      };
      if (!document.getElementById("facebook-jssdk")) {
        const script = document.createElement("script");
        script.id = "facebook-jssdk";
        script.src = "https://connect.facebook.net/en_US/sdk.js";
        script.async = true;
        script.defer = true;
        script.crossOrigin = "anonymous";
        script.onerror = () => {
          toast.error("Failed to load Meta SDK. Check your network.");
          resolve(false);
        };
        document.body.appendChild(script);
      }
      // Safety timeout — if SDK never loads within 10s, bail.
      setTimeout(() => {
        if (!window.FB) {
          toast.error("Meta SDK did not load in time. Please try again.");
          resolve(false);
        }
      }, 10000);
    });
  }

  async function handleConnect() {
    setLaunching(true);

    const ready = await ensureSdk();
    if (!ready || !window.FB) {
      setLaunching(false);
      return;
    }

    try {
      const { configId, state } = await startInstall.mutateAsync();

      window.FB.login(
        (response) => {
          const code = response.authResponse?.code;
          if (!code) {
            setLaunching(false);
            // User closed the popup or denied — not an error worth toasting.
            return;
          }
          completeInstall.mutate(
            { code, state },
            {
              onSuccess: () => {
                setLaunching(false);
                onOpenChange(false);
              },
              onError: () => setLaunching(false),
            },
          );
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            feature: "whatsapp_embedded_signup",
            sessionInfoVersion: 3,
          },
        },
      );
    } catch {
      setLaunching(false);
    }
  }

  const isPending = launching || completeInstall.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[#25D366]/15">
              <MessageCircle className="size-4 text-[#128C7E]" />
            </div>
            Connect WhatsApp Business
          </DialogTitle>
          <DialogDescription>
            Link your WhatsApp Business Account and phone number using Meta's
            Embedded Signup — no manual credentials required.
          </DialogDescription>
        </DialogHeader>

        {/* Prerequisites */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800 p-4">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-2">
            Before you continue, make sure you have:
          </p>
          <ul className="space-y-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 list-disc list-inside">
            <li>
              A <strong>Meta Business Manager</strong> account (
              <a
                href="https://business.facebook.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 underline"
              >
                business.facebook.com
                <ExternalLink className="size-2.5" />
              </a>
              )
            </li>
            <li>
              A verified phone number you want to use for WhatsApp Business (or
              a free test number Meta provides during signup)
            </li>
            <li>
              Admin access to the Facebook account you'll log in with during
              the popup
            </li>
          </ul>
        </div>

        {/* What happens next */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
          <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-1">
            After clicking Continue:
          </p>
          <ol className="space-y-0.5 text-[10px] text-muted-foreground list-decimal list-inside">
            <li>A Meta popup will open asking you to log in to Facebook</li>
            <li>
              Create or select a WhatsApp Business Account and phone number
            </li>
            <li>
              Grant permission for our app to manage messages on your behalf
            </li>
            <li>
              The popup closes and your WhatsApp channel appears as "Connected"
            </li>
          </ol>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={handleConnect}
            disabled={isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#20BD5A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Connecting...
              </>
            ) : (
              "Continue with Meta"
            )}
          </button>
          <button
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
