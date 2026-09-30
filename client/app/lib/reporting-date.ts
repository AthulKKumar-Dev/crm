/**
 * Calendar-day helpers for date-range filters that the server reads as
 * "00:00 on this day in the org's reporting timezone".
 */

const INDIA_TZ = "Asia/Kolkata";

/**
 * Mirrors the server's `resolveReportingTimeZone`: an explicitly-set non-UTC
 * org timezone wins, and the untouched "UTC" default reads as IST. Keep the two
 * in step, or the day sent here is not the day the server resolves.
 */
export function reportingTimeZone(orgTimezone?: string | null): string {
  const configured = orgTimezone?.trim();
  if (!configured || configured === "UTC") return INDIA_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: configured });
    return configured;
  } catch {
    return INDIA_TZ;
  }
}

/**
 * `YYYY-MM-DD` for the day `days` before today, where "today" is read in
 * `timeZone` — not the browser's zone, and not UTC. The old
 * `toISOString().split("T")[0]` answered in UTC, so between 00:00 and 05:30 IST
 * it went back one day further than asked.
 */
export function calendarDaysAgo(days: number, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}
