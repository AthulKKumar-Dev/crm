import { cn } from "~/lib/utils";
import type { CustomerActivityLog } from "~/types/api";

/**
 * Customer activity feed.
 *
 * Timeline markup follows `order-activity.tsx` (dot + connector + chip). Two
 * differences from that component, both forced by the data:
 *
 * 1. The row's text comes from `description`. The client type used to declare a
 *    `details` field that does not exist on `customer_activity_logs` — reading
 *    it yielded `undefined` with no compile error.
 * 2. `action` is a free-form string column with no server-side enum. Only
 *    'vip_changed' (customer.service) and 'vip_auto_recompute' (loyalty.service)
 *    are ever written today, so unknown values must degrade gracefully rather
 *    than index into a map and come back undefined.
 */

const ACTION_LABELS: Record<string, string> = {
  vip_changed: "VIP",
  vip_auto_recompute: "VIP",
  note_added: "Note",
  tag_added: "Tags",
};

const ACTION_DOTS: Record<string, string> = {
  vip_changed: "bg-brand",
  vip_auto_recompute: "bg-info",
};

/** "vip_auto_recompute" → "Vip auto recompute". Last resort when `description` is null. */
function humanise(action: string): string {
  const words = action.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function labelFor(action: string): string {
  return ACTION_LABELS[action] ?? "Activity";
}

function dotFor(action: string): string {
  return ACTION_DOTS[action] ?? "bg-muted-foreground";
}

export function CustomerActivity({ logs }: { logs: CustomerActivityLog[] }) {
  if (logs.length === 0) {
    return (
      <p className="px-5 py-4 text-caption text-muted-foreground">
        No activity recorded yet. Changes made directly in Shopify do not appear
        here.
      </p>
    );
  }

  return (
    <div className="px-5 py-4">
      <ol>
        {logs.map((log, i) => {
          const isLast = i === logs.length - 1;
          // `oldValue`/`newValue` are only populated for tier changes, and the
          // description already spells those out — so this line is supplementary,
          // not a fallback for a missing description.
          const transition =
            log.oldValue && log.newValue
              ? `${log.oldValue} → ${log.newValue}`
              : null;

          return (
            <li
              key={log.id}
              className={cn("relative flex gap-3", !isLast && "pb-4")}
            >
              {!isLast && (
                <span
                  aria-hidden
                  className="absolute bottom-0 left-[4px] top-4 w-px bg-border"
                />
              )}
              <span
                className={cn(
                  "relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full",
                  dotFor(log.action),
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-caption font-medium text-foreground">
                    {log.description || humanise(log.action)}
                  </p>
                  <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-micro font-medium uppercase tracking-wider text-muted-foreground">
                    {labelFor(log.action)}
                  </span>
                </div>
                <p className="mt-0.5 text-micro text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {transition && ` · ${transition}`}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
