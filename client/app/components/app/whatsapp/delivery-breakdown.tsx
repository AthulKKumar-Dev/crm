import type { WhatsAppStatusCounts } from "~/lib/campaigns-placeholder-data";
import {
  WA_STATUS_FILLS,
  WA_STATUS_LABELS,
  WA_STATUS_ORDER,
} from "~/lib/whatsapp-status";
import { cn } from "~/lib/utils";

interface DeliveryBreakdownProps {
  counts: WhatsAppStatusCounts;
  /**
   * Recipients the broadcast targets. Equals `sum(counts)` once sending starts;
   * for a draft it is the audience estimate and every count is zero, which is
   * why the bar renders empty rather than dividing by zero.
   */
  total: number;
  className?: string;
}

/**
 * The five terminal delivery buckets as one bar plus a tile row.
 *
 * A message holds exactly one status, so the buckets partition the recipients
 * and the segments genuinely sum to the whole — this is not a stack of
 * overlapping funnel stages.
 */
export function DeliveryBreakdown({
  counts,
  total,
  className,
}: DeliveryBreakdownProps) {
  const tallied = WA_STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0);
  const hasSends = tallied > 0;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {hasSends &&
          WA_STATUS_ORDER.map((status) =>
            counts[status] > 0 ? (
              <div
                key={status}
                className={WA_STATUS_FILLS[status]}
                /* Computed geometry — the one case DESIGN.md allows `style`. */
                style={{ width: `${(counts[status] / tallied) * 100}%` }}
                title={`${WA_STATUS_LABELS[status]}: ${counts[status].toLocaleString()}`}
              />
            ) : null,
          )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {WA_STATUS_ORDER.map((status) => (
          <div key={status}>
            <div className="flex items-center gap-1.5">
              <span
                className={cn("size-2 rounded-full", WA_STATUS_FILLS[status])}
                aria-hidden
              />
              <p className="text-caption text-muted-foreground">
                {WA_STATUS_LABELS[status]}
              </p>
            </div>
            <p className="mt-1 text-section tabular-nums text-foreground">
              {counts[status].toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <p className="text-caption text-muted-foreground">
        {hasSends
          ? `${tallied.toLocaleString()} of ${total.toLocaleString()} recipients processed.`
          : `${total.toLocaleString()} recipients queued up. Nothing has been sent.`}
      </p>
    </div>
  );
}
