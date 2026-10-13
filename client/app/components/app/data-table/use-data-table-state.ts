import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import type { ListUrlState } from "~/hooks/use-list-url-state";
import { useLocalState } from "~/hooks/use-session-state";
import { useDebounced } from "~/hooks/use-debounced";
import {
  isCalendarDay,
  type CustomDateRange,
  type DateRangePreset,
} from "~/hooks/use-date-range-filter";

import {
  defaultDirFor,
  defaultHidden,
  sortableColumns,
  sortTypeOf,
  type ColumnDef,
  type HiddenColumns,
  type SortDir,
} from "./column";

/**
 * One list's view state — tab, sort, filters, date range, scopes, page size,
 * hidden columns — kept in the URL (so a link reproduces the exact view and
 * Back lands where the row was clicked) except for the two layout preferences,
 * which live in localStorage per table.
 *
 * Built on `useListUrlState`, which already owns `page` and the search box and
 * mirrors the query string for detail-page breadcrumbs. Every setter here
 * issues exactly ONE `patchParams` call: a patch composes on the last written
 * params, so clearing search, filters and date together is still one write.
 *
 * The page translates this into its own API params and keeps its own query
 * hook; the hook never fetches.
 */

export interface SortState {
  field: string;
  dir: SortDir;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDef {
  key: string;
  label: string;
  /** URL key; defaults to `key`. Multi-select values are comma-joined. */
  param?: string;
  /** `undefined` while the options are still loading from the API. */
  options: ReadonlyArray<FilterOption> | undefined;
  multi?: boolean;
}

export interface ScopeDef {
  key: string;
  label: string;
  /** URL key; defaults to `key`. Unused when `onChange` is given. */
  param?: string;
  options: ReadonlyArray<FilterOption>;
  default: string;
  /**
   * Controlled escape hatch for a scope the page already owns (the inventory
   * Location picker writes `warehouseId` itself). With `onChange` set the hook
   * reads `value` and never touches the URL for this scope.
   */
  value?: string;
  onChange?: (value: string) => void;
}

export interface TabConfig {
  /** URL key; defaults to `view`. The default tab is the absence of the key. */
  param?: string;
  default: string;
  values: ReadonlyArray<string>;
}

export interface DateConfig<T extends string = string> {
  /** URL key for a preset; defaults to `range`. A custom range is `from`/`to`. */
  param?: string;
  presets: ReadonlyArray<DateRangePreset<T>>;
  default: T;
  /** Whether the chip offers a custom from/to. Defaults to true. */
  custom?: boolean;
  /** `YYYY-MM-DD` in the org's reporting zone — the last pickable day. Local today if omitted. */
  today?: string;
}

export interface SortConfig {
  default: SortState;
  /**
   * "prefix" — `sort=-field` (desc) / `sort=field` (asc). The default.
   * "split" — `sort=field&order=desc`, for lists whose links already use it.
   */
  encode?: "prefix" | "split";
  param?: string;
  orderParam?: string;
}

export interface LimitConfig {
  default?: number;
  options?: ReadonlyArray<number>;
}

export interface DataTableConfig<Row> {
  /** Same key as the page's `useListUrlState`; names the localStorage entries. */
  key: string;
  list: ListUrlState;
  columns: ReadonlyArray<ColumnDef<Row>>;
  tab?: TabConfig;
  sort?: SortConfig;
  filters?: ReadonlyArray<FilterDef>;
  date?: DateConfig;
  scopes?: ReadonlyArray<ScopeDef>;
  limit?: LimitConfig;
}

export interface DateState {
  preset: string;
  /** Set only when a custom range is applied; `preset` is then the default. */
  custom: CustomDateRange | null;
}

export interface DataTableState<Row> {
  config: DataTableConfig<Row>;
  page: number;
  setPage: (page: number) => void;
  search: string;
  setSearch: (value: string) => void;
  /** 350 ms behind `search`; the value the page should put in its query key. */
  debouncedSearch: string;
  tab: string;
  isDefaultTab: boolean;
  setTab: (tab: string) => void;
  sort: SortState | null;
  isDefaultSort: boolean;
  setSort: (sort: SortState) => void;
  resetSort: () => void;
  /** Selected values per filter key; absent key = no filter. */
  filters: Record<string, string[]>;
  setFilter: (key: string, values: string[]) => void;
  date: DateState | null;
  isDefaultDate: boolean;
  setDatePreset: (preset: string) => void;
  setDateCustom: (range: CustomDateRange) => void;
  /** Current value per scope key (default applied). */
  scope: Record<string, string>;
  setScope: (key: string, value: string) => void;
  limit: number;
  limitOptions: ReadonlyArray<number>;
  setLimit: (limit: number) => void;
  hidden: HiddenColumns;
  setHidden: (hidden: HiddenColumns) => void;
  resetHidden: () => void;
  isDefaultHidden: boolean;
  /** Search, filters, date and tab back to defaults in one write. Scopes stay. */
  clearAll: () => void;
  /** Any search text, filter value or non-default date range. */
  hasActiveFilters: boolean;
}

const DEFAULT_LIMIT = 25;
const DEFAULT_LIMIT_OPTIONS: ReadonlyArray<number> = [10, 25, 50, 100];

function isHiddenColumns(value: unknown): value is HiddenColumns {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => v === true)
  );
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sameHidden(a: HiddenColumns, b: HiddenColumns): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

export function useDataTableState<Row>(config: DataTableConfig<Row>): DataTableState<Row> {
  const { key, list, columns, tab, sort, filters = [], date, scopes = [], limit } = config;
  const [params] = useSearchParams();
  const { patchParams } = list;

  const debouncedSearch = useDebounced(list.search, 350);

  // ── Tab ────────────────────────────────────────────────────────────────────
  const tabParam = tab?.param ?? "view";
  const rawTab = params.get(tabParam);
  const currentTab =
    tab && rawTab !== null && tab.values.includes(rawTab) ? rawTab : (tab?.default ?? "");
  const setTab = useCallback(
    (next: string) => {
      if (!tab) return;
      patchParams({ [tabParam]: next === tab.default ? null : next });
    },
    [patchParams, tab, tabParam],
  );

  // ── Sort ───────────────────────────────────────────────────────────────────
  const sortable = useMemo(() => sortableColumns(columns), [columns]);
  const sortParam = sort?.param ?? "sort";
  const orderParam = sort?.orderParam ?? "order";
  const encode = sort?.encode ?? "prefix";
  const currentSort: SortState | null = useMemo(() => {
    if (!sort) return null;
    const raw = params.get(sortParam);
    if (raw === null) return sort.default;
    let field = raw;
    let dir: SortDir;
    if (encode === "prefix") {
      dir = raw.startsWith("-") ? "desc" : "asc";
      field = raw.replace(/^-/, "");
    } else {
      const order = params.get(orderParam);
      const column = sortable.find((c) => c.sortKey === field);
      dir =
        order === "asc" || order === "desc"
          ? order
          : defaultDirFor(column ? sortTypeOf(column) : "text");
    }
    // A field the table no longer sorts by (an old link) falls back to default.
    return sortable.some((c) => c.sortKey === field) ? { field, dir } : sort.default;
  }, [encode, orderParam, params, sort, sortParam, sortable]);
  const isDefaultSort =
    !sort ||
    !currentSort ||
    (currentSort.field === sort.default.field && currentSort.dir === sort.default.dir);
  const setSort = useCallback(
    (next: SortState) => {
      if (!sort) return;
      const isDefault = next.field === sort.default.field && next.dir === sort.default.dir;
      if (encode === "prefix") {
        patchParams({
          [sortParam]: isDefault ? null : `${next.dir === "desc" ? "-" : ""}${next.field}`,
        });
      } else {
        patchParams({
          [sortParam]: isDefault ? null : next.field,
          [orderParam]: isDefault ? null : next.dir,
        });
      }
    },
    [encode, orderParam, patchParams, sort, sortParam],
  );
  const resetSort = useCallback(() => {
    if (sort) setSort(sort.default);
  }, [setSort, sort]);

  // ── Filters ────────────────────────────────────────────────────────────────
  const currentFilters = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const f of filters) {
      const raw = params.get(f.param ?? f.key);
      if (!raw) continue;
      const values = f.multi ? raw.split(",").filter(Boolean) : [raw];
      // Options still loading: trust the URL. Loaded: drop values that no
      // longer exist, so a stale link cannot request an impossible filter.
      const options = f.options;
      const valid = options ? values.filter((v) => options.some((o) => o.value === v)) : values;
      if (valid.length) out[f.key] = valid;
    }
    return out;
  }, [filters, params]);
  const setFilter = useCallback(
    (filterKey: string, values: string[]) => {
      const def = filters.find((f) => f.key === filterKey);
      if (!def) return;
      patchParams({ [def.param ?? def.key]: values.length ? values.join(",") : null });
    },
    [filters, patchParams],
  );

  // ── Date ───────────────────────────────────────────────────────────────────
  const dateParam = date?.param ?? "range";
  const currentDate: DateState | null = useMemo(() => {
    if (!date) return null;
    const from = params.get("from");
    const to = params.get("to");
    if (date.custom !== false && isCalendarDay(from) && isCalendarDay(to) && from <= to) {
      return { preset: date.default, custom: { from, to } };
    }
    const raw = params.get(dateParam);
    const preset =
      raw !== null && date.presets.some((p) => p.value === raw) ? raw : date.default;
    return { preset, custom: null };
  }, [date, dateParam, params]);
  const isDefaultDate =
    !currentDate ||
    (currentDate.custom === null && currentDate.preset === (date?.default ?? ""));
  const setDatePreset = useCallback(
    (preset: string) => {
      if (!date) return;
      patchParams({ [dateParam]: preset === date.default ? null : preset, from: null, to: null });
    },
    [date, dateParam, patchParams],
  );
  const setDateCustom = useCallback(
    (range: CustomDateRange) => {
      if (!date) return;
      patchParams({ [dateParam]: null, from: range.from, to: range.to });
    },
    [date, dateParam, patchParams],
  );

  // ── Scopes ─────────────────────────────────────────────────────────────────
  const currentScope = useMemo(() => {
    const out: Record<string, string> = {};
    for (const s of scopes) {
      if (s.onChange) {
        out[s.key] = s.value ?? s.default;
        continue;
      }
      const raw = params.get(s.param ?? s.key);
      out[s.key] = raw !== null && s.options.some((o) => o.value === raw) ? raw : s.default;
    }
    return out;
  }, [params, scopes]);
  const setScope = useCallback(
    (scopeKey: string, value: string) => {
      const def = scopes.find((s) => s.key === scopeKey);
      if (!def) return;
      if (def.onChange) {
        def.onChange(value);
        return;
      }
      patchParams({ [def.param ?? def.key]: value === def.default ? null : value });
    },
    [patchParams, scopes],
  );

  // ── Page size ──────────────────────────────────────────────────────────────
  const limitDefault = limit?.default ?? DEFAULT_LIMIT;
  const limitOptions = limit?.options ?? DEFAULT_LIMIT_OPTIONS;
  // The remembered choice seeds a BARE url only; once `limit` is in the address
  // it wins, so a shared `?page=3` means the same rows for everyone.
  const [rememberedLimit, setRememberedLimit] = useLocalState<number>(
    `table.${key}.limit`,
    limitDefault,
    isNumber,
  );
  const rawLimit = Number(params.get("limit"));
  const currentLimit = limitOptions.includes(rawLimit)
    ? rawLimit
    : limitOptions.includes(rememberedLimit)
      ? rememberedLimit
      : limitDefault;
  const setLimit = useCallback(
    (next: number) => {
      setRememberedLimit(next);
      // Keep the first visible row on screen: row 51 at 25/page is page 3 at
      // 25 and page 2 at 50.
      const first = (list.page - 1) * currentLimit;
      const nextPage = Math.floor(first / next) + 1;
      patchParams({
        limit: next === limitDefault ? null : String(next),
        page: nextPage > 1 ? String(nextPage) : null,
      });
    },
    [currentLimit, limitDefault, list.page, patchParams, setRememberedLimit],
  );

  // ── Hidden columns ─────────────────────────────────────────────────────────
  const hiddenDefault = useMemo(() => defaultHidden(columns), [columns]);
  const [storedHidden, setStoredHidden] = useLocalState<HiddenColumns | null>(
    `table.${key}.hidden`,
    null,
    (v): v is HiddenColumns | null => v === null || isHiddenColumns(v),
  );
  const hidden = useMemo(() => {
    if (!storedHidden) return hiddenDefault;
    // Never hide a locked column or one that no longer exists.
    const out: HiddenColumns = {};
    for (const column of columns) {
      if (!column.locked && storedHidden[column.key]) out[column.key] = true;
    }
    return out;
  }, [columns, hiddenDefault, storedHidden]);
  const setHidden = useCallback((next: HiddenColumns) => setStoredHidden(next), [setStoredHidden]);
  const resetHidden = useCallback(() => setStoredHidden(null), [setStoredHidden]);

  // ── Clear all ──────────────────────────────────────────────────────────────
  const hasActiveFilters =
    list.search.trim() !== "" || Object.keys(currentFilters).length > 0 || !isDefaultDate;
  const clearAll = useCallback(() => {
    // The search key rides in the same patch, so the box resets with the url.
    const patch: Record<string, string | null> = { [list.searchKey]: null };
    for (const f of filters) patch[f.param ?? f.key] = null;
    if (date) {
      patch[dateParam] = null;
      patch.from = null;
      patch.to = null;
    }
    // The tab narrows the list too; "Clear filters" on an empty tab view
    // would otherwise be a button that changes nothing.
    if (tab) patch[tabParam] = null;
    patchParams(patch);
  }, [date, dateParam, filters, list.searchKey, patchParams, tab, tabParam]);

  return {
    config,
    page: list.page,
    setPage: list.setPage,
    search: list.search,
    setSearch: list.setSearch,
    debouncedSearch,
    tab: currentTab,
    isDefaultTab: !tab || currentTab === tab.default,
    setTab,
    sort: currentSort,
    isDefaultSort,
    setSort,
    resetSort,
    filters: currentFilters,
    setFilter,
    date: currentDate,
    isDefaultDate,
    setDatePreset,
    setDateCustom,
    scope: currentScope,
    setScope,
    limit: currentLimit,
    limitOptions,
    setLimit,
    hidden,
    setHidden,
    resetHidden,
    isDefaultHidden: sameHidden(hidden, hiddenDefault),
    clearAll,
    hasActiveFilters,
  };
}
