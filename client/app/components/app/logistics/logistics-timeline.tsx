import { formatDateTimeShort } from "~/lib/logistics-format";
import { SHIPMENT_JOURNEY } from "~/lib/logistics-status";
import { cn } from "~/lib/utils";
import type { ShipmentEvent, ShipmentStatus } from "~/types/api";

/**
 * The tracking panel: a horizontal progress rail over a dated event list.
 *
 * The rail answers "how far along is it" in one glance; the list answers "what
 * actually happened". Splitting the two is what lets the list stay purely
 * chronological instead of trying to do both jobs at once.
 */

/**
 * The rail. Five stages rather than the full nine — at a card's width, nine
 * labels collide and stop being readable.
 */
const RAIL_STAGES: { status: ShipmentStatus; label: string }[] = [
  { status: "AWB_ASSIGNED", label: "Label" },
  { status: "PICKED_UP", label: "Picked up" },
  { status: "IN_TRANSIT", label: "In transit" },
  { status: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { status: "DELIVERED", label: "Delivered" },
];

export function ShipmentProgressRail({
  status,
  className,
}: {
  status: ShipmentStatus;
  className?: string;
}) {
  const journeyIndex = SHIPMENT_JOURNEY.indexOf(status);

  // A parcel in NDR, DELAYED or RTO is off the forward line. It has physically
  // reached transit, so the rail stops there and turns red rather than
  // resetting to zero or claiming progress it has not made.
  const isDerailed = journeyIndex < 0;
  const effective = isDerailed ? SHIPMENT_JOURNEY.indexOf("IN_TRANSIT") : journeyIndex;

  const reachedIndex = RAIL_STAGES.reduce((last, stage, index) => {
    return SHIPMENT_JOURNEY.indexOf(stage.status) <= effective ? index : last;
  }, -1);

  return (
    <ol className={cn("flex items-start", className)}>
      {RAIL_STAGES.map((stage, index) => {
        const isDone = index < reachedIndex;
        const isCurrent = index === reachedIndex;

        return (
          <li key={stage.status} className="relative flex flex-1 flex-col items-center gap-1.5">
            <span
              className={cn(
                "h-0.5 w-full rounded-full",
                isDerailed && isCurrent
                  ? "bg-danger"
                  : isDone || isCurrent
                    ? "bg-brand"
                    : "bg-border",
              )}
            />
            <span
              className={cn(
                "-mt-3 size-2.5 rounded-full ring-4 ring-card",
                isDerailed && isCurrent
                  ? "bg-danger"
                  : isDone || isCurrent
                    ? "bg-brand"
                    : "bg-border",
              )}
            />
            <span
              className={cn(
                "px-1 text-center text-micro",
                isCurrent ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {stage.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The dated event list.
 *
 * Date on the left in its own column rather than inline with the label: scans
 * arrive in bursts, and a left-aligned date column lets the eye run down it to
 * find "what happened on the 2nd" without reading every row.
 */
export function LogisticsTimeline({
  events,
  className,
}: {
  events: ShipmentEvent[];
  className?: string;
}) {
  if (events.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-caption text-muted-foreground">
        No tracking events yet. They appear here as the courier scans the parcel.
      </p>
    );
  }

  // Newest first: an operator opening a shipment wants the latest scan.
  const ordered = [...events].reverse();

  return (
    <ol className={cn("flex flex-col", className)}>
      {ordered.map((event, index) => {
        const isLatest = index === 0;
        const isLast = index === ordered.length - 1;
        const [date, time] = formatDateTimeShort(event.occurredAt).split(", ");

        return (
          <li
            key={event.id}
            className="grid grid-cols-[76px_20px_minmax(0,1fr)] items-start gap-3"
          >
            <div className="pt-0.5 text-right">
              <p className="text-caption font-medium tabular-nums text-foreground">{date}</p>
              <p className="text-micro tabular-nums text-muted-foreground">{time}</p>
            </div>

            <div className="flex h-full flex-col items-center">
              <span
                className={cn(
                  "mt-1 size-2.5 shrink-0 rounded-full",
                  event.isException
                    ? "bg-danger"
                    : isLatest
                      ? "bg-brand ring-4 ring-brand/25"
                      : "bg-border",
                )}
              />
              {!isLast && <span className="min-h-6 w-px flex-1 bg-border" />}
            </div>

            <div className={cn("min-w-0", isLast ? "pb-0" : "pb-4")}>
              <p
                className={cn(
                  "text-body font-medium",
                  event.isException ? "text-danger" : "text-foreground",
                )}
              >
                {event.label}
              </p>
              {event.location && (
                <p className="text-caption text-muted-foreground">{event.location}</p>
              )}
              {event.remark && (
                <p className="mt-0.5 text-caption text-muted-foreground">{event.remark}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

