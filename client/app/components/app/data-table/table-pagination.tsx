import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";

import { pageItems } from "./pagination";

const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * The table footer: "26–50 of 1,240 orders", rows-per-page, numbered pages.
 * `total` is undefined until the first response lands.
 */
export function TablePagination({
  page,
  limit,
  total,
  totalPages,
  noun,
  limitOptions,
  onPage,
  onLimit,
}: {
  page: number;
  limit: number;
  total: number | undefined;
  totalPages: number | undefined;
  noun: string;
  limitOptions: ReadonlyArray<number>;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
}) {
  const pages = Math.max(1, totalPages ?? 1);
  const from = total ? (page - 1) * limit + 1 : 0;
  const to = total ? Math.min(page * limit, total) : 0;
  const summary =
    total === undefined ? `Loading ${noun}…` : `${fmt(from)}–${fmt(to)} of ${fmt(total)} ${noun}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2">
      <span aria-live="polite" className="text-label tabular-nums text-muted-foreground">
        {summary}
      </span>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-label text-muted-foreground">Rows per page</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-haspopup="listbox"
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-card pl-2.5 pr-2 text-label font-medium tabular-nums text-foreground ring-1 ring-border transition-colors hover:bg-muted aria-expanded:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                {limit}
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-24 min-w-0">
              <DropdownMenuRadioGroup
                value={String(limit)}
                onValueChange={(value) => onLimit(Number(value))}
              >
                {limitOptions.map((option) => (
                  <DropdownMenuRadioItem key={option} value={String(option)} className="tabular-nums">
                    {option}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <nav aria-label="Pagination" className="flex items-center gap-0.5">
          <PageButton onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </PageButton>
          {pageItems(page, pages).map((item, index) =>
            item.kind === "gap" ? (
              <span
                key={`gap-${index}`}
                className="min-w-5 text-center text-label text-muted-foreground/60"
              >
                …
              </span>
            ) : (
              <PageButton
                key={item.page}
                onClick={() => onPage(item.page)}
                aria-label={`Page ${item.page}`}
                aria-current={item.page === page ? "page" : undefined}
                className={cn(
                  "min-w-7 px-1.5 tabular-nums",
                  item.page === page
                    ? "bg-muted font-semibold text-foreground ring-1 ring-border"
                    : "text-muted-foreground",
                )}
              >
                {fmt(item.page)}
              </PageButton>
            ),
          )}
          <PageButton onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
            <ChevronRight className="size-4" />
          </PageButton>
        </nav>
      </div>
    </div>
  );
}

function PageButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-7 min-w-7 items-center justify-center rounded-md text-label text-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
        className,
      )}
      {...props}
    />
  );
}
