/**
 * WhatsApp 24-hour customer-service window maths.
 *
 * Every function here is pure and takes `now` as an argument rather than
 * calling Date.now() internally. Two reasons: it is testable without faking
 * timers, and it lets the ticking hook own the single source of "now" so a
 * header pill and a composer hint can never disagree by a frame.
 *
 * Clock skew is not corrected. If the user's machine is minutes off, the
 * countdown is off by the same amount. A real API would return a `serverTime`
 * field and the caller would carry a fixed offset; the mock has no such field.
 */

export interface WindowState {
  /** "6h 12m" · "48m" · "12:04" under an hour · "Closed" · "—" when absent. */
  label: string;
  isOpen: boolean;
  /** Under 60 minutes — the caller switches to a warning tone. */
  isClosingSoon: boolean;
  /** Milliseconds left, clamped at 0. Infinity when there is no window. */
  remainingMs: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Below this, the label switches to m:ss and the caller ticks every second. */
export const CLOSING_SOON_MS = HOUR;

/**
 * Describe the window as of `now`.
 *
 * `expiresAt` null means the channel has no window concept (Instagram, and any
 * future channel without Meta's re-engagement rule) — reported as open with no
 * label rather than as closed, because "Closed" would be a lie that stops an
 * agent from replying.
 */
export function describeSessionWindow(
  expiresAt: string | null | undefined,
  now: number,
): WindowState {
  if (!expiresAt) {
    return { label: "—", isOpen: true, isClosingSoon: false, remainingMs: Infinity };
  }

  const remainingMs = new Date(expiresAt).getTime() - now;

  if (!Number.isFinite(remainingMs)) {
    return { label: "—", isOpen: true, isClosingSoon: false, remainingMs: Infinity };
  }

  if (remainingMs <= 0) {
    return { label: "Closed", isOpen: false, isClosingSoon: false, remainingMs: 0 };
  }

  return {
    label: formatRemaining(remainingMs),
    isOpen: true,
    isClosingSoon: remainingMs < CLOSING_SOON_MS,
    remainingMs,
  };
}

/**
 * "6h 12m" above an hour, "12:04" below it.
 *
 * The switch to m:ss is deliberate: under an hour the exact number starts
 * mattering to an agent deciding whether to type a reply or reach for a
 * template, and "0m" for the last 59 seconds reads as already-closed.
 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "Closed";

  if (ms >= HOUR) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.floor((ms % HOUR) / MINUTE);
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }

  const minutes = Math.floor(ms / MINUTE);
  const seconds = Math.floor((ms % MINUTE) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * How long until the label would next change, from `now`.
 *
 * Above an hour the finest unit is minutes, so the next change is at the next
 * minute boundary of the *remaining* time — not of the wall clock. Ticking on
 * the wall-clock minute would still be correct, but this way a single timeout
 * lands exactly on the transition instead of up to 59s late.
 */
export function msUntilLabelChange(remainingMs: number): number {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return Infinity;
  if (remainingMs < CLOSING_SOON_MS) {
    // Ticking every second; fire on the next whole second.
    return remainingMs % 1000 || 1000;
  }
  return remainingMs % MINUTE || MINUTE;
}
