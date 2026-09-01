import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * A filing-tab data warning the merchant can quiet — but only for the state
 * that produced it.
 *
 * These warnings sit above the return because they describe reasons the figures
 * below may not be what should be filed. The problem is that some of them
 * cannot be acted on quickly: "N invoices have a line with no HSN code" is true
 * for every real organisation here (no product in the live catalogues carries
 * one) and clearing it is hours of merchant data entry, not a click. A warning
 * that can neither be quieted nor quickly fixed is one people learn to look
 * past — which costs the other three their credibility too.
 *
 * So dismissal is tied to `signature`, the count that raised it. Dismissing
 * "12 invoices" hides that; if it later reads 15 — or 8 — the banner returns,
 * because the number changing is new information. Nothing can be silenced
 * permanently, and nothing nags about a state already acknowledged.
 *
 * localStorage rather than sessionStorage on purpose: sessionStorage empties
 * when the tab closes, so the banner would come back every day whether or not
 * the count moved, which is the opposite of the rule above. Matches how
 * `order-slip.tsx` and `labels-print.tsx` already persist view preferences.
 */
export function DismissibleWarning({
  id,
  scope,
  signature,
  label,
  children,
}: {
  /**
   * Stable identifier for this warning. It forms part of the storage key, so
   * renaming one silently un-dismisses it for everybody.
   */
  id: string;
  /**
   * Organisation id. The counts are org-scoped, so the dismissal must be —
   * quieting a warning in one workspace must not silence another's.
   */
  scope: string | undefined;
  /** The count that raised the warning. Dismissal lasts only while it holds. */
  signature: number;
  /** Names the warning for screen readers, so the × is not a bare glyph. */
  label: string;
  children: ReactNode;
}) {
  const storageKey = `gst-warning-dismissed:${scope ?? "none"}:${id}`;

  // Read straight away rather than in an effect: these banners only mount once
  // `stats` has resolved from the query client, so we are always on the client
  // by this point and there is no server render to disagree with. Reading in an
  // effect instead would flash the banner before hiding it.
  const [dismissedAt, setDismissedAt] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      // Private mode, or storage blocked by policy. Degrade to showing the
      // warning — never to hiding one we failed to confirm was dismissed.
      return null;
    }
  });

  // The key changes when the organisation is switched, so re-read rather than
  // carrying the previous workspace's answer across.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setDismissedAt(window.localStorage.getItem(storageKey));
    } catch {
      setDismissedAt(null);
    }
  }, [storageKey]);

  if (dismissedAt === String(signature)) return null;

  function dismiss() {
    const value = String(signature);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(storageKey, value);
      } catch {
        // Couldn't persist — still hide it for this view rather than leaving a
        // button that visibly does nothing.
      }
    }
    setDismissedAt(value);
  }

  return (
    <div className="flex items-start gap-2 rounded-xl bg-warning-subtle px-5 py-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="flex-1 text-caption">{children}</div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={`Dismiss warning: ${label}`}
        title="Dismiss until this number changes"
        className="-mr-1 mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-warning/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
