import { useEffect, useState } from "react";

/**
 * A clock that re-renders its caller on a fixed cadence.
 *
 * For relative timestamps ("14m", "3h") that would otherwise freeze at whatever
 * they read when the component mounted.
 *
 * Call it in the component that actually renders the timestamps, never at the
 * top of a page — every tick re-renders the whole subtree, and a route-level
 * clock would re-render the folder rail, the message thread and the customer
 * panel once a minute to update a label in the list.
 *
 * Aligned to the wall-clock boundary, so "1m" becomes "2m" when the minute
 * actually turns rather than up to 59s later. Recomputes from Date.now() each
 * tick rather than accumulating, so a backgrounded tab that fires its timer
 * late self-corrects instead of drifting.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const align = setTimeout(
      () => {
        setNow(Date.now());
        interval = setInterval(() => setNow(Date.now()), intervalMs);
      },
      intervalMs - (Date.now() % intervalMs),
    );

    return () => {
      clearTimeout(align);
      clearInterval(interval);
    };
  }, [intervalMs]);

  return now;
}
