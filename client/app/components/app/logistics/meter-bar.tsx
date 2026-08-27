import { METER_FILL, type MeterTone } from "~/lib/logistics-status";
import { cn } from "~/lib/utils";

/**
 * The horizontal share bars used by Returns, Zones and Analytics.
 *
 * Three screens draw the same "label · value · filled track" shape, so it lives
 * here rather than being re-inlined each time with slightly different heights.
 */

/** A labelled bar: caption row above, track below. */
export function MeterRow({
  label,
  value,
  percent,
  tone = "brand",
  className,
}: {
  label: string;
  /** Right-hand caption — a percentage, an amount, a count. */
  value: string;
  /** 0-100. */
  percent: number;
  tone?: MeterTone;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-caption text-foreground">{label}</span>
        <span className="shrink-0 text-caption tabular-nums text-muted-foreground">{value}</span>
      </div>
      <Track percent={percent} tone={tone} />
    </div>
  );
}

/** The track on its own, for rows that lay their own labels out. */
export function Track({
  percent,
  tone = "brand",
  className,
}: {
  percent: number;
  tone?: MeterTone;
  className?: string;
}) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full", METER_FILL[tone])}
        // Computed geometry — the one sanctioned use of an inline style.
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

/**
 * A single track split between two tones — on-time against late.
 *
 * One bar rather than two stacked ones: the question is what share of the total
 * each represents, and two separate bars make the reader do the division.
 */
export function SplitTrack({
  primaryPercent,
  primaryTone = "brand",
  secondaryTone = "danger",
  className,
}: {
  primaryPercent: number;
  primaryTone?: MeterTone;
  secondaryTone?: MeterTone;
  className?: string;
}) {
  const primary = Math.min(100, Math.max(0, primaryPercent));

  return (
    <div className={cn("flex h-2 overflow-hidden rounded-full bg-muted", className)}>
      <div className={METER_FILL[primaryTone]} style={{ width: `${primary}%` }} />
      <div className={METER_FILL[secondaryTone]} style={{ width: `${100 - primary}%` }} />
    </div>
  );
}

/** A stacked bar made of many segments, for the zone-share strip. */
export function StackedTrack({
  segments,
  className,
}: {
  segments: { id: string; percent: number; tone: MeterTone }[];
  className?: string;
}) {
  return (
    <div className={cn("flex h-3.5 overflow-hidden rounded-full bg-muted", className)}>
      {segments.map((segment) => (
        <div
          key={segment.id}
          className={METER_FILL[segment.tone]}
          style={{ width: `${segment.percent}%` }}
        />
      ))}
    </div>
  );
}

/** Legend swatch matching a track tone. */
export function Swatch({ tone, className }: { tone: MeterTone; className?: string }) {
  return <span className={cn("size-2.5 shrink-0 rounded-sm", METER_FILL[tone], className)} />;
}
