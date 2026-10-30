import type { ReactNode } from "react";
import { Search, type LucideIcon } from "lucide-react";

import { EmptyState } from "~/components/app/empty-state";
import { QueryErrorState } from "~/components/app/query-error-state";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

import type { ColumnDef } from "./column";

export interface EmptyStateSpec {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
}

const STATE_PAD = "px-6 py-11";

/** Grey bars in the real grid, so the layout does not jump when rows land. */
export function SkeletonRows<Row>({
  count,
  columns,
  template,
  hasSelection,
  hasActions,
  cellClass,
}: {
  count: number;
  columns: ReadonlyArray<ColumnDef<Row>>;
  template: string;
  hasSelection: boolean;
  hasActions: boolean;
  cellClass: (column: ColumnDef<Row>, index: number) => string;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          role="row"
          aria-hidden
          className="grid min-h-14 items-center border-b border-border bg-card"
          style={{ gridTemplateColumns: template }}
        >
          {hasSelection && (
            <div className="sticky left-0 z-10 flex items-center justify-center bg-inherit">
              <Skeleton className="size-4 rounded-[4px]" />
            </div>
          )}
          {columns.map((column, colIndex) => {
            // Deterministic variety so the shimmer reads as text, not bars.
            const width = 45 + ((rowIndex * 7 + colIndex * 3) % 5) * 10;
            return (
              <div key={column.key} className={cellClass(column, colIndex)}>
                <Skeleton className="h-2.5 rounded" style={{ width: `${width}%` }} />
              </div>
            );
          })}
          {hasActions && <div />}
        </div>
      ))}
    </>
  );
}

export function TableErrorState({ noun, onRetry }: { noun: string; onRetry: () => void }) {
  return (
    <div className={STATE_PAD}>
      <QueryErrorState
        resource={noun}
        onRetry={onRetry}
        description="The server didn't respond. Your search, filters and page are kept, so retrying picks up where you left off."
      />
    </div>
  );
}

export function TableEmptyState({ spec }: { spec: EmptyStateSpec }) {
  return (
    <div className={STATE_PAD}>
      <EmptyState
        icon={spec.icon}
        title={spec.title}
        description={spec.description}
        action={spec.action}
      />
    </div>
  );
}

export function TableNoResults({
  noun,
  search,
  onClear,
}: {
  noun: string;
  search: string;
  onClear: () => void;
}) {
  return (
    <div className={cn(STATE_PAD)}>
      <EmptyState
        icon={Search}
        title={search ? `No ${noun} match “${search}”` : `No ${noun} match these filters`}
        description="Try a different search term or remove some filters."
        action={
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    </div>
  );
}
