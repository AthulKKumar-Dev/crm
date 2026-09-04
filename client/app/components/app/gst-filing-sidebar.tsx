import { ArrowRight, Download, Loader2, Lock, LockOpen } from "lucide-react";

import type { GstFiling } from "~/types/api";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import {
  daysUntil,
  formatDueDate,
  formatPeriodShort,
  returnDueDate,
} from "~/lib/gst-return";

export type ReturnType = "GSTR1" | "GSTR3B";

const RETURN_LABELS: Record<ReturnType, string> = {
  GSTR1: "GSTR-1",
  GSTR3B: "GSTR-3B",
};

interface GstFilingSidebarProps {
  financialYear: string;
  period: string;
  returnType: ReturnType;
  /** Derived, already-formatted facts about the period. */
  facts: ReadonlyArray<{ label: string; value: string }>;
  periodLabel: string;
  onSwitchReturn: (next: ReturnType) => void;
  onDownloadCsv: () => void;
  isDownloading?: boolean;
  /** The filing covering this period and registration, if any. */
  filing?: GstFiling | null;
  /** Whether this user may lock or reopen a period. */
  canFile?: boolean;
  onMarkFiled?: () => void;
  onReopen?: () => void;
  /**
   * True while a warehouse scope narrows the figures. Filing is hidden then:
   * a warehouse view is management information, not a return.
   */
  scoped?: boolean;
}

/** Countdown phrasing that stays honest once the deadline has passed. */
function dueCountdown(days: number): string {
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

function dueBadgeClasses(days: number): string {
  if (days < 0) return "bg-danger-subtle text-danger";
  if (days <= 7) return "bg-warning-strong-subtle text-warning-strong";
  return "bg-muted text-muted-foreground";
}

export function GstFilingSidebar({
  financialYear,
  period,
  returnType,
  facts,
  periodLabel,
  onSwitchReturn,
  onDownloadCsv,
  isDownloading,
  filing,
  canFile,
  onMarkFiled,
  onReopen,
  scoped,
}: GstFilingSidebarProps) {
  const dueDate = returnDueDate(financialYear, period, returnType);
  const daysLeft = dueDate ? daysUntil(dueDate) : null;
  const otherReturn: ReturnType = returnType === "GSTR1" ? "GSTR3B" : "GSTR1";
  const periodShort = formatPeriodShort(financialYear, period);

  return (
    <div className="space-y-4">
      {/* Return period */}
      <Card className="gap-0 border-transparent bg-brand py-0 shadow-sm">
        <div className="space-y-4 p-5">
          <div>
            <p className="text-micro font-semibold uppercase tracking-wider text-brand-foreground/70">
              Return period
            </p>
            <p className="font-heading text-subhead text-brand-foreground">
              {periodLabel}
            </p>
            {dueDate && daysLeft !== null && (
              <p className="mt-0.5 text-caption text-brand-foreground/80">
                {RETURN_LABELS[returnType]} due {formatDueDate(dueDate)} ·{" "}
                {dueCountdown(daysLeft)}
              </p>
            )}
          </div>

          <dl className="space-y-1.5">
            {facts.map((fact) => (
              <div key={fact.label} className="flex justify-between gap-3">
                <dt className="text-caption text-brand-foreground/80">
                  {fact.label}
                </dt>
                <dd className="text-caption font-semibold tabular-nums text-brand-foreground">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>

          {filing && (
            <div className="flex items-start gap-2 rounded-lg bg-brand-foreground/10 px-3 py-2">
              <Lock className="mt-0.5 size-3.5 shrink-0 text-brand-foreground" />
              <p className="text-caption text-brand-foreground">
                <span className="font-semibold">Filed</span>{" "}
                {new Date(filing.filedAt).toLocaleDateString("en-IN")}
                {filing.arn && (
                  <span className="block font-mono text-micro text-brand-foreground/80">
                    ARN {filing.arn}
                  </span>
                )}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="brand"
              size="sm"
              onClick={() => onSwitchReturn(otherReturn)}
            >
              Go to {RETURN_LABELS[otherReturn]}
              <ArrowRight />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadCsv}
              disabled={isDownloading}
            >
              {isDownloading ? <Loader2 className="animate-spin" /> : <Download />}
              {scoped ? "Download CSV (warehouse view)" : "Download CSV"}
            </Button>
            {/* Hidden while scoped to a warehouse — those figures are not a
                return, so offering to file them would be wrong. */}
            {canFile && !scoped && (
              filing ? (
                <Button variant="outline" size="sm" onClick={onReopen}>
                  <LockOpen />
                  Reopen period
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={onMarkFiled}>
                  <Lock />
                  Mark as filed
                </Button>
              )
            )}
          </div>
        </div>
      </Card>

      {/* Statutory due dates for this period */}
      <Card className="gap-0 py-0 shadow-sm ring-border">
        <div className="border-b px-5 py-3">
          <p className="text-body font-semibold text-foreground">This period</p>
        </div>
        <ul className="divide-y">
          {(["GSTR1", "GSTR3B"] as const).map((type) => {
            const due = returnDueDate(financialYear, period, type);
            const days = due ? daysUntil(due) : null;

            return (
              <li
                key={type}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <span className="text-caption text-foreground">
                  {RETURN_LABELS[type]}
                  {periodShort && (
                    <span className="text-muted-foreground"> · {periodShort}</span>
                  )}
                </span>
                {due && days !== null && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-micro font-medium",
                      dueBadgeClasses(days)
                    )}
                  >
                    Due {formatDueDate(due)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
