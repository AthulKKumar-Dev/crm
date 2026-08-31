import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";

/**
 * A "Label: value ▾" filter chip for a table header.
 *
 * Three of these replace the filter drawer that used to sit behind a button.
 * The drawer could hold eight dimensions but hid every one of them until you
 * opened it; a chip carries its own current value on its face, so the table's
 * state is readable without clicking anything. That only works while the count
 * stays small — past four chips the header wraps and the drawer wins again.
 */

export interface FilterChipOption {
  value: string;
  label: string;
}

export function FilterChip({
  label,
  options,
  selected,
  onChange,
  /** Shown when nothing is selected. */
  allLabel = "All",
}: {
  label: string;
  options: FilterChipOption[];
  /** Empty means "no filter". */
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel?: string;
}) {
  const isFiltered = selected.length > 0;

  const display = !isFiltered
    ? allLabel
    : selected.length === 1
      ? (options.find((option) => option.value === selected[0])?.label ?? selected[0])
      : `${selected.length} selected`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-caption font-medium transition-colors",
            isFiltered
              ? "border-ink bg-ink text-brand"
              : "border-input text-foreground hover:bg-muted",
          )}
        >
          <span className={isFiltered ? "text-brand/70" : "text-muted-foreground"}>{label}:</span>
          {display}
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onClick={() => onChange([])}
          className={cn("text-caption", !isFiltered && "font-semibold")}
        >
          {allLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={() =>
              onChange(
                selected.includes(option.value)
                  ? selected.filter((value) => value !== option.value)
                  : [...selected, option.value],
              )
            }
            onSelect={(event) => event.preventDefault()}
            className="text-caption"
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Single-select variant, for a date range or anything else mutually exclusive. */
export function SelectChip({
  options,
  value,
  onChange,
}: {
  options: FilterChipOption[];
  value: string;
  onChange: (next: string) => void;
}) {
  const current = options.find((option) => option.value === value) ?? options[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input px-3 text-caption font-medium text-foreground transition-colors hover:bg-muted"
        >
          {current?.label}
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn("text-caption", option.value === value && "font-semibold")}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
