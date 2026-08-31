import type { ShipmentPackage, ShippingAddress } from "~/types/api";

/**
 * Pure display and arithmetic helpers for the logistics module.
 *
 * Same rule as `conversation-format.ts` and `session-window.ts`: every
 * time-dependent function takes `now` as an argument and never calls
 * `Date.now()` itself, so the ticking hook (`use-now.ts`) owns exactly one
 * clock and a table of thirty SLA cells cannot disagree with itself mid-render.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/* ─── Weight ────────────────────────────────────────────────────────────── */

/**
 * Indian courier standard: L x W x H in centimetres, divided by 5000, gives
 * kilograms. Every courier in the fixture set uses this divisor; a courier that
 * used 4000 would need this to become a per-courier field.
 */
export const VOLUMETRIC_DIVISOR = 5000;

export function volumetricWeight(pkg: Pick<ShipmentPackage, "length" | "width" | "height">): number {
  const raw = (pkg.length * pkg.width * pkg.height) / VOLUMETRIC_DIVISOR;
  return Math.round(raw * 100) / 100;
}

/** What the courier actually bills: the greater of dead weight and volumetric. */
export function chargeableWeight(
  pkg: Pick<ShipmentPackage, "length" | "width" | "height" | "weight">,
): number {
  return Math.max(pkg.weight, volumetricWeight(pkg));
}

/**
 * Totals across a multi-package shipment.
 *
 * `count` multiplies each row — a row of "3 x 30x20x10 @ 0.5kg" is three boxes,
 * not one. Summing the rows without it under-bills by a factor of the count,
 * which is exactly the kind of error that only shows up on the courier invoice.
 */
export function packageTotals(packages: ShipmentPackage[]): {
  boxes: number;
  actual: number;
  volumetric: number;
  chargeable: number;
} {
  let boxes = 0;
  let actual = 0;
  let volumetric = 0;
  let chargeable = 0;

  for (const pkg of packages) {
    const n = Math.max(1, pkg.count);
    boxes += n;
    actual += pkg.weight * n;
    volumetric += volumetricWeight(pkg) * n;
    chargeable += chargeableWeight(pkg) * n;
  }

  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    boxes,
    actual: round(actual),
    volumetric: round(volumetric),
    chargeable: round(chargeable),
  };
}

/** "1.25 kg" — two decimals only when they carry information. */
export function formatWeight(kg: number): string {
  if (!Number.isFinite(kg)) return "—";
  const fixed = Math.round(kg * 100) / 100;
  return `${Number.isInteger(fixed) ? fixed : fixed.toFixed(2)} kg`;
}

/** "30 x 20 x 10 cm" */
export function formatDimensions(
  pkg: Pick<ShipmentPackage, "length" | "width" | "height">,
): string {
  return `${pkg.length} × ${pkg.width} × ${pkg.height} cm`;
}

/* ─── SLA / countdown ───────────────────────────────────────────────────── */

export interface SlaState {
  label: string;
  /** Past the promise. */
  isBreached: boolean;
  /** Inside the warning window but not yet breached. */
  isAtRisk: boolean;
  remainingMs: number;
}

/** Under this much time left, an SLA reads as at-risk rather than healthy. */
export const AT_RISK_MS = 4 * HOUR;

/**
 * Describe a ship-by or delivery promise relative to `now`.
 *
 * Returns the raw `remainingMs` alongside the label so a caller can decide how
 * often to re-render without re-deriving the arithmetic — the same contract
 * `describeSessionWindow` uses.
 */
export function describeSla(dueAt: string | null | undefined, now: number): SlaState {
  if (!dueAt) {
    return { label: "—", isBreached: false, isAtRisk: false, remainingMs: Number.POSITIVE_INFINITY };
  }

  const remainingMs = new Date(dueAt).getTime() - now;

  if (remainingMs <= 0) {
    return {
      label: `Overdue ${formatDuration(-remainingMs)}`,
      isBreached: true,
      isAtRisk: false,
      remainingMs,
    };
  }

  return {
    label: `${formatDuration(remainingMs)} left`,
    isBreached: false,
    isAtRisk: remainingMs <= AT_RISK_MS,
    remainingMs,
  };
}

/** Token classes for an SLA pill, so the table and the detail page agree. */
export function slaClasses(state: SlaState): string {
  if (state.isBreached) return "bg-danger-subtle text-danger";
  if (state.isAtRisk) return "bg-warning-strong-subtle text-warning-strong";
  return "bg-muted text-muted-foreground";
}

/** "2d 4h" / "6h 20m" / "18m" — coarse, because these sit in a table cell. */
export function formatDuration(ms: number): string {
  const abs = Math.max(0, ms);
  if (abs >= DAY) {
    const days = Math.floor(abs / DAY);
    const hours = Math.floor((abs % DAY) / HOUR);
    return hours ? `${days}d ${hours}h` : `${days}d`;
  }
  if (abs >= HOUR) {
    const hours = Math.floor(abs / HOUR);
    const mins = Math.floor((abs % HOUR) / MINUTE);
    return mins ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const mins = Math.max(1, Math.floor(abs / MINUTE));
  return `${mins}m`;
}

/**
 * How long until `describeSla`'s label would change, so a caller can schedule
 * the next tick instead of re-rendering every second. Mirrors
 * `msUntilLabelChange` in session-window.ts.
 */
export function msUntilSlaLabelChange(remainingMs: number): number {
  const abs = Math.abs(remainingMs);
  if (abs >= DAY) return HOUR;
  if (abs >= HOUR) return MINUTE;
  return MINUTE;
}

/* ─── Relative time ─────────────────────────────────────────────────────── */

/** "just now" / "40m ago" / "2h ago" / "Yesterday" / "12 Aug" */
export function formatRelative(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = now - then;

  if (diff < 0) return formatShortDate(iso);
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 2 * DAY) return "Yesterday";
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return formatShortDate(iso);
}

/** "12 Aug" — pinned to en-IN so grouping and order match the rest of the app. */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "12 Aug, 14:30" */
export function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString(
    "en-IN",
    { hour: "2-digit", minute: "2-digit", hour12: false },
  )}`;
}

/** "Tomorrow" / "Today" / "Wed, 27 Aug" — for delivery promises. */
export function formatPromiseDate(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const target = startOfDay(new Date(iso).getTime());
  const today = startOfDay(now);
  const days = Math.round((target - today) / DAY);

  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole days between two ISO dates, for TAT figures. */
export function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY));
}

/* ─── Addresses and identifiers ─────────────────────────────────────────── */

/**
 * "Kochi, KL 682024" — the one-line form used in table cells.
 *
 * Takes the flattened `destination*` fields that every list row carries rather
 * than a `ShippingAddress`: list payloads deliberately do not include the full
 * address, and requiring one here would mean fetching a detail record per row.
 * Use `formatAddressLine` when you do have the address object.
 */
export function formatDestination(row: {
  destinationCity: string;
  destinationState: string;
  destinationPincode: string;
}): string {
  return `${row.destinationCity}, ${row.destinationState} ${row.destinationPincode}`;
}

/** The same one-liner, from a full address. */
export function formatAddressLine(address: {
  city: string;
  state: string;
  pincode: string;
}): string {
  return `${address.city}, ${address.state} ${address.pincode}`;
}

/** Multi-line address block for detail panels. Empty parts are dropped. */
export function addressLines(address: ShippingAddress): string[] {
  return [
    address.line1,
    address.line2,
    `${address.city}, ${address.state} ${address.pincode}`,
    address.country,
  ].filter((line): line is string => Boolean(line && line.trim()));
}

/** Groups a long AWB for readability without changing what gets copied. */
export function formatAwb(awb: string | null): string {
  if (!awb) return "—";
  return awb.replace(/(.{4})/g, "$1 ").trim();
}

/** "1 pkg · 1.25 kg" / "3 pkgs · 4.1 kg" */
export function formatPackageSummary(count: number, weight: number): string {
  return `${count} ${count === 1 ? "pkg" : "pkgs"} · ${formatWeight(weight)}`;
}

/** "AM" from "Aarav Mehta" — avatar fallback. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** "94.2%" — percentages are stored as 0-100, not 0-1. */
export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/** "3.2 days" */
export function formatTat(days: number): string {
  if (!Number.isFinite(days)) return "—";
  return `${days.toFixed(1)} days`;
}
