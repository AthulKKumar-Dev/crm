import { oneOf, useSessionState } from "~/hooks/use-session-state";
import { calendarDaysAgo, formatDayRange } from "~/lib/reporting-date";

export interface DateRangePreset<T extends string = string> {
  value: T;
  label: string;
}

/** Inclusive calendar days, `YYYY-MM-DD`, in the org's reporting zone. */
export interface CustomDateRange {
  from: string;
  to: string;
}

const CUSTOM = "custom";
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A real `YYYY-MM-DD` day. The shape alone is not enough: `2026-02-30` passes
 * the regex, and `Intl` then throws on it in the middle of a render.
 */
function isCalendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !CALENDAR_DAY.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
}

function isCustomRange(value: unknown): value is CustomDateRange | null {
  if (value === null) return true;
  if (typeof value !== "object") return false;
  const { from, to } = value as Record<string, unknown>;
  return isCalendarDay(from) && isCalendarDay(to) && from <= to;
}

/**
 * A page's date filter: one of its presets, or a custom from/to.
 *
 * The preset keeps its existing session key, so a remembered "30d" survives
 * this change. The custom dates sit beside it under `<key>.custom`; "custom"
 * with no valid dates saved falls back to the default rather than to no filter.
 */
export function useDateRangeFilter<T extends string>(
  key: string,
  fallback: T,
  presets: ReadonlyArray<DateRangePreset<T>>,
) {
  const [selected, setSelected] = useSessionState<T | typeof CUSTOM>(
    key,
    fallback,
    oneOf<T | typeof CUSTOM>([...presets.map((p) => p.value), CUSTOM]),
  );
  const [saved, setSaved] = useSessionState<CustomDateRange | null>(
    `${key}.custom`,
    null,
    isCustomRange,
  );

  const custom = selected === CUSTOM ? saved : null;
  const preset: T = selected === CUSTOM ? fallback : selected;

  return {
    preset,
    /** Set only while a custom range is the active choice. */
    custom,
    label: custom
      ? formatDayRange(custom.from, custom.to)
      : (presets.find((p) => p.value === preset)?.label ?? ""),
    /** File-name part for exports: the preset key, or the two dates. */
    fileTag: custom ? `${custom.from}-to-${custom.to}` : preset,
    selectPreset: (value: T) => setSelected(value),
    applyCustom: (range: CustomDateRange) => {
      setSaved(range);
      setSelected(CUSTOM);
    },
  };
}

/** Day counts behind the Orders list's and a customer's Orders tab presets. */
export const ORDER_RANGE_DAYS = { all: null, "7d": 7, "30d": 30, "90d": 90 } as const;
export type OrderRangePreset = keyof typeof ORDER_RANGE_DAYS;

/**
 * The `dateFrom`/`dateTo` an order query sends. "Last 7 days" is 7 full days
 * plus today from 00:00 in the reporting zone — the window the dashboard's
 * "Last 7 days" covers — and sends no `dateTo`, so it runs to now.
 */
export function orderRangeDates(
  filter: { preset: OrderRangePreset; custom: CustomDateRange | null },
  timeZone: string,
): { dateFrom?: string; dateTo?: string } {
  if (filter.custom) return { dateFrom: filter.custom.from, dateTo: filter.custom.to };
  const days = ORDER_RANGE_DAYS[filter.preset];
  return { dateFrom: days != null ? calendarDaysAgo(days, timeZone) : undefined };
}
