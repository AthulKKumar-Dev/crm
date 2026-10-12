import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { useMediaQuery } from "~/hooks/use-media-query";
import type { CustomDateRange, DateRangePreset } from "~/hooks/use-date-range-filter";
import { cn } from "~/lib/utils";

/**
 * `YYYY-MM-DD` ↔ local-midnight Date. The calendar reads only the date parts,
 * so the browser's own zone can never shift the day that is sent.
 */
function toDate(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

function toDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const optionClass =
  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-caption hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";

/**
 * Date filter for a page header: the page's presets plus a custom from/to.
 *
 * A preset applies on click. A custom range is a draft until Apply, so
 * half-picking a range never refetches the page.
 */
export function DateRangeFilter<T extends string>({
  presets,
  preset,
  custom,
  label,
  today,
  onPresetChange,
  onCustomApply,
  className,
}: {
  presets: ReadonlyArray<DateRangePreset<T>>;
  preset: T;
  custom: CustomDateRange | null;
  label: string;
  /** `YYYY-MM-DD` in the reporting zone; later days cannot be picked. */
  today: string;
  onPresetChange: (value: T) => void;
  onCustomApply: (range: CustomDateRange) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  // Two months side by side are ~560px wide; a phone gets one.
  const twoMonths = useMediaQuery("(min-width: 640px)");
  const todayDate = toDate(today);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    // Reopen on what is applied, not on an abandoned draft.
    setShowCalendar(custom !== null);
    setDraft(custom ? { from: toDate(custom.from), to: toDate(custom.to) } : undefined);
  }

  function apply() {
    if (!draft?.from) return;
    // One click is a one-day range.
    onCustomApply({ from: toDay(draft.from), to: toDay(draft.to ?? draft.from) });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 text-caption font-medium whitespace-nowrap shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
            className,
          )}
        >
          <CalendarDays className="size-3.5 text-muted-foreground" />
          <span>{label}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)]">
        <div className="flex flex-col sm:flex-row">
          <ul className="flex flex-col gap-0.5 border-border p-1 sm:w-36 sm:border-r">
            {presets.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  className={optionClass}
                  onClick={() => {
                    onPresetChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                  {!custom && preset === option.value && <Check className="size-3.5" />}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className={cn(optionClass, showCalendar && "bg-accent")}
                onClick={() => setShowCalendar(true)}
              >
                Custom range
                {custom && <Check className="size-3.5" />}
              </button>
            </li>
          </ul>
          {showCalendar && (
            <div className="border-t border-border p-2 sm:border-t-0">
              <Calendar
                mode="range"
                selected={draft}
                onSelect={setDraft}
                resetOnSelect
                numberOfMonths={twoMonths ? 2 : 1}
                // Side by side, a month's trailing days repeat the next
                // month's first ones, so one date shows up twice.
                showOutsideDays={!twoMonths}
                // Two months end on the current one rather than starting on it.
                defaultMonth={
                  draft?.from ??
                  new Date(todayDate.getFullYear(), todayDate.getMonth() - (twoMonths ? 1 : 0), 1)
                }
                endMonth={todayDate}
                disabled={{ after: todayDate }}
              />
              <div className="flex justify-end gap-2 border-t border-border px-1 pt-2">
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="brand" disabled={!draft?.from} onClick={apply}>
                  Apply
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
