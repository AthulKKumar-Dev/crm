import * as React from "react";
import { useNavigate } from "react-router";
import { ChevronRight, Search } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";

/**
 * The one table in the logistics module.
 *
 * Both list screens need the same handful of things — a column config,
 * click-through rows, an optional selection column, a trailing cell that
 * swallows row clicks, and a card layout for phones. Hand-rolling that twice is
 * how two tables end up disagreeing about where the actions column goes.
 *
 * Not TanStack Table: it is not a dependency, the app hand-writes its tables,
 * and the store already paginates, so there is nothing to sort or virtualise.
 */

export interface LogisticsColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Right-align figures. Pair with `tabular-nums` in the cell. */
  align?: "left" | "right";
  /** Tailwind width class, e.g. "w-32". */
  width?: string;
  /**
   * Drop below this breakpoint. The header and every cell get the matching
   * `hidden … table-cell` pair, so the column disappears without the row
   * layout shifting.
   */
  minWidth?: "md" | "lg" | "xl";
}

const MIN_WIDTH_CLASS: Record<NonNullable<LogisticsColumn<unknown>["minWidth"]>, string> = {
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

interface LogisticsTableProps<T> {
  rows: T[];
  columns: LogisticsColumn<T>[];
  rowId: (row: T) => string;
  /** Clicking a row navigates here, and each row grows a trailing chevron. */
  rowHref?: (row: T) => string;
  /** Clicking a row calls this instead. Ignored when `rowHref` is set. */
  onRowClick?: (row: T) => void;
  /** Rendered in a trailing cell that swallows row clicks. */
  rowActions?: (row: T) => React.ReactNode;
  /** Below `md`, rows render through this instead of as a table. */
  renderCard?: (row: T) => React.ReactNode;

  /* Selection — omit all four to hide the checkbox column. */
  selectedIds?: ReadonlySet<string>;
  onToggleRow?: (id: string) => void;
  onToggleAll?: (ids: string[], nextChecked: boolean) => void;

  className?: string;
}

export function LogisticsTable<T>({
  rows,
  columns,
  rowId,
  rowHref,
  onRowClick,
  rowActions,
  renderCard,
  selectedIds,
  onToggleRow,
  onToggleAll,
  className,
}: LogisticsTableProps<T>) {
  const navigate = useNavigate();

  const selectable = Boolean(selectedIds && onToggleRow);
  const pageIds = rows.map(rowId);
  const selectedOnPage = pageIds.filter((id) => selectedIds?.has(id)).length;
  const headerChecked =
    selectedOnPage === 0 ? false : selectedOnPage === pageIds.length ? true : "indeterminate";

  function activate(row: T) {
    const href = rowHref?.(row);
    if (href) navigate(href);
    else onRowClick?.(row);
  }

  const isInteractive = Boolean(rowHref || onRowClick);

  return (
    <>
      {/* Card list — phones. A ten-column table at 375px is unusable, and
          horizontal scroll hides the columns that matter most. */}
      {renderCard && (
        <ul className="divide-y md:hidden">
          {rows.map((row) => (
            <li key={rowId(row)} className="px-4 py-3">
              {isInteractive ? (
                <button type="button" onClick={() => activate(row)} className="w-full text-left">
                  {renderCard(row)}
                </button>
              ) : (
                renderCard(row)
              )}
            </li>
          ))}
        </ul>
      )}

      <div className={cn("overflow-x-auto", renderCard && "hidden md:block", className)}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {selectable && (
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={headerChecked}
                    onCheckedChange={(next) => onToggleAll?.(pageIds, next === true)}
                    aria-label="Select all rows on this page"
                  />
                </TableHead>
              )}

              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={cn(
                    "text-caption font-medium text-muted-foreground",
                    column.align === "right" && "text-right",
                    column.width,
                    column.minWidth && MIN_WIDTH_CLASS[column.minWidth],
                  )}
                >
                  {column.header}
                </TableHead>
              ))}

              {(rowActions || rowHref) && (
                <TableHead className="w-10 pr-4 text-right" aria-label="Actions" />
              )}
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((row) => {
              const id = rowId(row);
              const isSelected = selectedIds?.has(id) ?? false;

              return (
                <TableRow
                  key={id}
                  data-state={isSelected ? "selected" : undefined}
                  className={cn("group/row", isInteractive && "cursor-pointer")}
                  onClick={isInteractive ? () => activate(row) : undefined}
                >
                  {selectable && (
                    <TableCell className="pl-4" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleRow?.(id)}
                        aria-label={`Select ${id}`}
                      />
                    </TableCell>
                  )}

                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      className={cn(
                        "px-3 py-2.5 text-body",
                        column.align === "right" && "text-right",
                        column.minWidth && MIN_WIDTH_CLASS[column.minWidth],
                      )}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}

                  {(rowActions || rowHref) && (
                    <TableCell
                      className="pr-4 text-right"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {rowActions ? (
                        rowActions(row)
                      ) : (
                        <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/**
 * The muted footer bar under a table: a count on the left, paging on the right.
 *
 * "Showing 12 of 174" rather than "Page 1 of 15" because the first tells you
 * how much there is to work through and the second only tells you where the
 * cursor is.
 */
export function TableFooter({
  shown,
  total,
  noun,
  page,
  totalPages,
  onPageChange,
}: {
  shown: number;
  total: number;
  /** Plural. "shipments", "orders". */
  noun: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted px-4 py-2.5">
      <span className="text-caption text-muted-foreground">
        Showing <span className="tabular-nums">{shown}</span> of{" "}
        <span className="tabular-nums">{total}</span> {noun}
      </span>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="bg-card"
          disabled={page === 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="bg-card"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

/** The search box that sits in a table card's header row. */
export function TableSearch({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative min-w-50 max-w-xs flex-1">
      <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-lg border border-input bg-transparent pl-8 pr-3 text-caption placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
      />
    </div>
  );
}

/**
 * Selection state for a paginated list.
 *
 * The `useEffect` is the point. Selection is a Set of ids so it survives
 * re-filtering — which means without this, filtering away a selected row leaves
 * it selected and invisible, and "Ship 8 orders" silently acts on rows the
 * operator can no longer see.
 *
 * `resetKey` should be every input that changes which rows are on screen.
 */
export function useRowSelection(resetKey: unknown) {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [resetKey]);

  const toggleRow = React.useCallback((id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = React.useCallback((ids: string[], nextChecked: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      ids.forEach((id) => (nextChecked ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  const clear = React.useCallback(() => setSelectedIds(new Set()), []);

  return { selectedIds, toggleRow, toggleAll, clear };
}
