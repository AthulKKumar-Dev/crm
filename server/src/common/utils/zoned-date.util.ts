/**
 * Timezone-aware date helpers for statutory (GST) date math.
 *
 * Every deployment target runs UTC — no `TZ` is set in the root Dockerfile,
 * server/Dockerfile, render.yaml, railway.json or either docker-compose file,
 * and node:20-alpine ships without tzdata. So `Date#getMonth()` /
 * `getFullYear()` and `new Date(y, m, d)` answer in UTC, not in the merchant's
 * timezone. For an IST (+05:30) merchant that shifts every financial-year and
 * GST-period boundary by 5.5 hours: a sale at 00:30 IST on 1 April is
 * 2025-03-31T19:00Z, so naive math files it in the PREVIOUS financial year and
 * consumes a serial from that year's sequence.
 *
 * `Organization.timezone` already exists (default "UTC", the UI offers
 * Asia/Kolkata) — these helpers are what make it load-bearing.
 */

/** GST is an Indian tax regime, so its statutory calendar is IST. */
export const INDIA_TZ = 'Asia/Kolkata';

export interface ZonedParts {
  year: number;
  /** 1-12, unlike Date#getMonth(). */
  month: number;
  day: number;
}

/**
 * Timezone to use for an organization's GST date math.
 *
 * `Organization.timezone` defaults to `"UTC"` and most merchants never change
 * it, which left the timezone-aware financial-year and period logic reading UTC
 * and therefore behaving exactly as the bug it replaced. Every GST feature here
 * is India-specific — GSTIN, CGST/SGST/IGST, Indian state codes, an April–March
 * year — so "GST enabled with an untouched UTC timezone" is a misconfiguration,
 * not a deliberate choice, and IST is the only meaningful reading.
 *
 * An explicitly-set non-UTC timezone always wins. Non-GST organizations are
 * untouched.
 */
export function resolveGstTimeZone(org: {
  timezone?: string | null;
  gstEnabled?: boolean | null;
}): string {
  const configured = org.timezone?.trim();

  if (configured && configured !== 'UTC') return configured;
  if (org.gstEnabled) return INDIA_TZ;

  return 'UTC';
}

/** True when `value` is a bare calendar day (`YYYY-MM-DD`) rather than an instant. */
function isCalendarDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

/**
 * Inclusive lower bound for a date filter.
 *
 * A bare `YYYY-MM-DD` means a calendar day in the merchant's timezone, not UTC
 * midnight — otherwise an IST merchant filtering "April" silently loses the
 * first 5.5 hours of it. Full ISO instants are passed through unchanged.
 */
export function zonedDayStart(value: string, timeZone: string): Date {
  if (!isCalendarDay(value)) return new Date(value);

  const [year, month, day] = value.trim().split('-').map(Number);
  return zonedTimeToUtc(year, month, day, timeZone);
}

/**
 * EXCLUSIVE upper bound for a date filter — the start of the following day.
 *
 * Use with `lt`, not `lte`. Treating a bare `YYYY-MM-DD` as an inclusive bound
 * pins it to that day's first instant, which excludes almost the entire day the
 * user asked for.
 */
export function zonedDayEndExclusive(value: string, timeZone: string): Date {
  if (!isCalendarDay(value)) return new Date(value);

  const [year, month, day] = value.trim().split('-').map(Number);
  // Day + 1 via UTC arithmetic, then resolved back into the target zone.
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return zonedTimeToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    timeZone,
  );
}

/** Wall-clock Y/M/D as observed in `timeZone` at the given instant. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const pick = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);

  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

/** Offset (ms) to add to a UTC instant to get `timeZone`'s wall clock. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const pick = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);

  // `hour` can format as 24 for midnight under hour12:false on some ICU builds.
  const asIfUtc = Date.UTC(
    pick('year'),
    pick('month') - 1,
    pick('day'),
    pick('hour') % 24,
    pick('minute'),
    pick('second'),
  );

  return asIfUtc - date.getTime();
}

/**
 * The UTC instant at which `timeZone`'s wall clock reads the given local time.
 *
 * Two-pass: the offset itself depends on the instant (DST), so resolve with a
 * first guess and re-check. India has no DST, but the helper stays correct for
 * any org timezone.
 */
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  timeZone: string,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): Date {
  const guess = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, ms),
  );
  const firstOffset = zoneOffsetMs(guess, timeZone);
  const adjusted = new Date(guess.getTime() - firstOffset);
  const secondOffset = zoneOffsetMs(adjusted, timeZone);

  return secondOffset === firstOffset
    ? adjusted
    : new Date(guess.getTime() - secondOffset);
}

/**
 * Indian financial year (1 April – 31 March) for an instant, as observed in
 * `timeZone`. Example: 2026-03-31T19:00Z is 00:30 IST on 1 Apr 2026 → "2026-27".
 */
export function getFinancialYear(date: Date, timeZone: string): string {
  const { year, month } = zonedParts(date, timeZone);

  if (month >= 4) {
    return `${year}-${(year + 1).toString().slice(2)}`;
  }
  return `${year - 1}-${year.toString().slice(2)}`;
}

/**
 * Half-open [from, toExclusive) instants for a GST return period, anchored to
 * the merchant's timezone.
 *
 * `period` is a month ("04".."03") or a quarter ("Q1".."Q4") within the given
 * financial year. Half-open on purpose: the previous implementation used an
 * inclusive `23:59:59` bound with no milliseconds, silently dropping anything
 * in the last second of the period.
 */
export function gstPeriodRange(
  financialYear: string,
  period: string,
  timeZone: string,
): { from: Date; toExclusive: Date } {
  const startYear = parseInt(financialYear.split('-')[0], 10);
  if (Number.isNaN(startYear)) {
    throw new Error(`Invalid financial year: ${financialYear}`);
  }

  // Month index within the FY, 0 = April.
  let firstFyMonth: number;
  let monthSpan: number;

  if (period.toUpperCase().startsWith('Q')) {
    const quarter = parseInt(period.slice(1), 10);
    if (!(quarter >= 1 && quarter <= 4)) {
      throw new Error(`Invalid quarter: ${period}`);
    }
    firstFyMonth = (quarter - 1) * 3;
    monthSpan = 3;
  } else {
    const calendarMonth = parseInt(period, 10);
    if (!(calendarMonth >= 1 && calendarMonth <= 12)) {
      throw new Error(`Invalid period: ${period}`);
    }
    // April(4) → 0 … March(3) → 11
    firstFyMonth = (calendarMonth - 4 + 12) % 12;
    monthSpan = 1;
  }

  const toCalendar = (fyMonthIndex: number) => {
    const absolute = 3 + fyMonthIndex; // 3 = April as a 0-indexed month
    return {
      year: startYear + Math.floor(absolute / 12),
      month: (absolute % 12) + 1, // 1-12
    };
  };

  const start = toCalendar(firstFyMonth);
  const end = toCalendar(firstFyMonth + monthSpan);

  return {
    from: zonedTimeToUtc(start.year, start.month, 1, timeZone),
    toExclusive: zonedTimeToUtc(end.year, end.month, 1, timeZone),
  };
}
