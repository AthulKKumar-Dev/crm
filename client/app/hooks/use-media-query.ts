import { useEffect, useState } from "react";

/**
 * Track a CSS media query from JS.
 *
 * Almost every responsive decision in this app belongs in CSS and does not need
 * this. Reach for it only when a value has to *start* at a width-dependent
 * default that the user can then override — a class cannot express that,
 * because once state exists it has to be initialised to something.
 *
 * The initial value is read synchronously so there is no first-paint flash of
 * the wrong branch. Safe because this app is client-rendered (`ssr: false` in
 * react-router.config.ts); under SSR this would need a mounted guard.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);

    // Re-sync in case the viewport changed between first render and effect.
    setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * Where the inbox has room for list + thread + customer panel at once.
 *
 * Used only to pick the panel's *initial* open state — below this a 13-inch
 * laptop starts on list + thread, and the agent can still pull the panel in as
 * a column from the thread header. It never hides the toggle.
 */
export const PANEL_DEFAULT_OPEN_QUERY = "(min-width: 1280px)";
