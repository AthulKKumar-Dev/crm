import { Info } from "lucide-react";

/**
 * Marks a page whose figures are sample data rather than the org's real
 * numbers. These sections are visual previews with no backend behind them, and
 * without this banner their invented totals read as genuine reporting.
 */
export function PreviewNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
