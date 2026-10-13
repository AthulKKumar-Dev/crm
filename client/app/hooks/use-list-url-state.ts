import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigationType, useSearchParams } from "react-router";

import { isString, useSessionState } from "~/hooks/use-session-state";

/**
 * Page number and search text for a paginated list, kept in the URL.
 *
 * Plain `useState` lost both the moment a row was opened: the list route
 * unmounts, and coming back — browser Back or the detail page's breadcrumb —
 * started over on page 1. With the view in the URL, Back lands on the exact
 * address the row was clicked from. Writes use `replace`, so paging and typing
 * never add history entries: one Back from a detail page is always the list.
 *
 * The navbar links to the bare path on purpose — that is the fresh start.
 * Opened bare, page is 1 and search is empty; nothing is read back from
 * storage. The current query string IS mirrored to the session (`<key>.return`)
 * so a detail page can link back to the list as it was; see useListReturnPath.
 */
export interface ListUrlState {
  page: number;
  setPage: (page: number) => void;
  /** Any change other than paging itself — a filter, a sort — lands on page 1. */
  resetPage: () => void;
  search: string;
  setSearch: (value: string) => void;
  /**
   * `null`/"" deletes a key. Deletes `page` unless the patch carries one. A
   * patch may carry the search key: the box then resets in the same write.
   */
  patchParams: (patch: Record<string, string | null>) => void;
  /** The URL key the search box writes (`q` unless overridden). */
  searchKey: string;
}

/**
 * Above this a hand-edited `?page=` is nonsense rather than a view. It would go
 * to the API as-is; a rejection there leaves the list in its error state with
 * no page count for the clamp to work from, so it is read as page 1 instead.
 */
const MAX_PAGE = 100_000;

export function useListUrlState(
  key: string,
  { searchKey = "q" }: { searchKey?: string } = {},
): ListUrlState {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigationType = useNavigationType();

  const rawPage = searchParams.get("page");
  const pageParam = Number(rawPage);
  const page =
    Number.isInteger(pageParam) && pageParam > 0 && pageParam <= MAX_PAGE ? pageParam : 1;

  // Search is local so typing is instant; the URL copy is written on every
  // change. It is re-seeded only when the URL's value moves under a MOUNTED
  // list by a navigation that was not ours — the navbar's bare link clicked
  // while already here (a push), or Back/Forward between two views of the same
  // list (a pop) — so the box never keeps a term the address bar no longer
  // carries. Our own writes are replaces and are skipped: the router commits
  // them inside a transition, and re-seeding from one of those could snap the
  // box back a keystroke. Same adjust-during-render pattern as useSessionState.
  const urlSearch = searchParams.get(searchKey) ?? "";
  const [search, setSearchState] = useState(urlSearch);
  const [seenUrlSearch, setSeenUrlSearch] = useState(urlSearch);
  if (urlSearch !== seenUrlSearch) {
    setSeenUrlSearch(urlSearch);
    if (navigationType !== "REPLACE") setSearchState(urlSearch);
  }

  // Patches build on the LAST WRITTEN params, not this render's. React Router's
  // functional `setSearchParams(prev => …)` reads `prev` from the render
  // closure too, so without this two patches in one event handler (clear the
  // search AND drop a filter) would have the second overwrite the first. The
  // ref is re-seeded from the router every render and advanced on every write.
  // A patch that changes nothing (resetting to page 1 while on page 1) is not
  // written at all — a navigation to the same address is wasted work and churns
  // the location key.
  //
  // A patch may carry the search key itself; the local copy is updated too so
  // the box never disagrees with the address bar.
  const latestParams = useRef(searchParams);
  latestParams.current = searchParams;
  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      if (searchKey in patch) setSearchState(patch[searchKey] ?? "");
      const base = latestParams.current;
      const next = new URLSearchParams(base);
      for (const [name, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(name);
        else next.set(name, value);
      }
      if (!("page" in patch)) next.delete("page");
      if (next.toString() === base.toString()) return;
      latestParams.current = next;
      setSearchParams(next, { replace: true });
    },
    [searchKey, setSearchParams],
  );

  // Page 1 is the absence of the param, so the bare URL stays bare.
  const setPage = useCallback(
    (next: number) => patchParams({ page: next > 1 ? String(next) : null }),
    [patchParams],
  );
  const resetPage = useCallback(() => patchParams({}), [patchParams]);
  const setSearch = useCallback(
    (value: string) => patchParams({ [searchKey]: value || null }),
    [patchParams, searchKey],
  );

  // The address bar says what the screen shows: a param the parse rejected
  // (`?page=abc`, `?page=1e20`) or one spelt differently from its value
  // (`?page=1`, `?page=03`) is rewritten to the canonical form, where page 1
  // is the absence of the param. Idempotent, so it cannot loop.
  useEffect(() => {
    if (rawPage === null) return;
    const canonical = page > 1 ? String(page) : null;
    if (rawPage !== canonical) patchParams({ page: canonical });
  }, [rawPage, page, patchParams]);

  // Written here, read by useListReturnPath on the detail pages.
  const [saved, setSaved] = useSessionState(`${key}.return`, "", isString);
  useEffect(() => {
    if (location.search !== saved) setSaved(location.search);
  }, [location.search, saved, setSaved]);

  return { page, setPage, resetPage, search, setSearch, patchParams, searchKey };
}

/**
 * Keeps a restored page inside the result set: an order deleted while the
 * merchant sat on the last page, or a return to page 100 of a list that now
 * has 90. Pass `undefined` while the meta on screen is a placeholder for other
 * params (keepPreviousData) — that count belongs to a different query.
 */
export function useClampPage(
  { page, setPage }: ListUrlState,
  totalPages: number | undefined,
) {
  useEffect(() => {
    if (totalPages === undefined) return;
    // The server reports 0 pages for an empty result; page 1 is still home.
    const last = Math.max(1, totalPages);
    if (page > last) setPage(last);
  }, [page, totalPages, setPage]);
}

/** Where a detail page's breadcrumb goes: the list as it was last seen. */
export function useListReturnPath(key: string, basePath: string): string {
  const [saved] = useSessionState(`${key}.return`, "", isString);
  return `${basePath}${saved}`;
}
