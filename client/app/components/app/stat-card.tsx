import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";

import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { ChartLineDefault } from "./chart-line-default";

interface StatCardProps {
    label: string;
    /** Undefined renders an em dash — callers pass undefined while loading. */
    value?: string;
    /**
     * Omit when there is no trend to show — a failed request, or a metric with
     * no comparison period. Callers used to pass 0 in that case, which rendered
     * a GREEN up-trend "0%" badge (`change >= 0` is true for zero), so a failed
     * stats request looked like four healthy metrics.
     */
    change?: number;
    changeLabel?: string;
    /** Renders a footer link instead of a trend badge. */
    linkTo?: string;
    linkLabel?: string;
    className?: string;
    icon?: ReactNode;
    isLoading?: boolean;
    /**
     * Renders a sparkline beside the value. Off by default — five routes use
     * this card and only the dashboard wants a chart in it.
     */
    sparkline?: boolean;
    /**
     * "card" — standalone card for Orders / Customers / Analytics (default).
     * "inline" — compact strip layout with sparkline for Products.
     */
    variant?: "card" | "inline";
}

const iconChip =
    "flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground";

/** Displays a single KPI metric with its current value, trend percentage or link, and optional icon. */
export function StatCard({
    label,
    value,
    change,
    changeLabel,
    linkTo,
    linkLabel,
    className,
    icon,
    isLoading,
    sparkline = false,
    variant = "card",
}: StatCardProps) {
    const hasTrend = change !== undefined;
    const isPositive = (change ?? 0) >= 0;

    const trendBadge = hasTrend && (
        <span
            className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold",
                isPositive ? "bg-ink text-brand" : "bg-danger-subtle text-danger"
            )}
        >
            {isPositive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {Math.abs(change!)}%
        </span>
    );

    if (variant === "inline") {
        return (
            <div className={cn("", className)}>
                <div className="flex items-center gap-3">
                    <div className="flex flex-1 flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <p className="text-body font-medium text-muted-foreground">{label}</p>
                            {/* {icon && <div className={iconChip}>{icon}</div>} */}
                        </div>
                        <div className="flex items-center gap-3">
                            <p className="text-subhead text-foreground">{value ?? "—"}</p>
                            {trendBadge}
                        </div>
                    </div>
                    <div className="w-full flex-1">
                        <ChartLineDefault />
                    </div>
                </div>
                {changeLabel && (
                    <p className="mt-1.5 text-caption text-muted-foreground">{changeLabel}</p>
                )}
            </div>
        );
    }

    return (
        <div className={cn(" bg-card p-5 shadow-sm ring-1 ring-border", className)}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex flex-2 flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                        <p className="text-body font-medium text-muted-foreground">{label}</p>
                        {/* {icon && <div className={iconChip}>{icon}</div>} */}
                    </div>

                    <div className="flex items-end justify-between gap-3">
                        {isLoading ? (
                            <Skeleton className="h-7 w-24" />
                        ) : (
                            <p className="text-stat text-foreground">{value ?? "—"}</p>
                        )}
                        {trendBadge}
                    </div>
                    <div className="flex items-start justify-between gap-2">
                        <p className="text-body font-medium text-muted-foreground">{label}</p>
                        {/* {icon && <div className={iconChip}>{icon}</div>} */}
                    </div>
                </div>

                {sparkline && (
                    <div className="w-full flex-2">
                        <ChartLineDefault variant="area" tone="brand" />
                    </div>
                )}
            </div>

            {changeLabel && (
                <p className="mt-1.5 text-caption text-muted-foreground">{changeLabel}</p>
            )}

            {/* {linkTo && linkLabel && (
                <Link
                    to={linkTo}
                    className="mt-4 flex items-center gap-1 text-caption font-medium text-brand-strong hover:text-brand-strong-hover"
                >
                    {linkLabel} <ArrowRight className="size-3" />
                </Link>
            )} */}
        </div>
    );
}

