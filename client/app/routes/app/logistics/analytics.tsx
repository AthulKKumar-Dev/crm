import { Download } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "~/components/ui/page-header";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { QueryErrorState } from "~/components/app/query-error-state";
import { StatCard } from "~/components/app/stat-card";
import { MeterRow, SplitTrack, Swatch } from "~/components/app/logistics/meter-bar";
import { useDeliveryAnalytics } from "~/hooks/use-logistics-queries";
import { formatPercent, formatTat } from "~/lib/logistics-format";
import { cn, formatCurrency } from "~/lib/utils";
import type { DeliveryAnalytics } from "~/types/api";

export function meta() {
  return [{ title: "Delivery analytics | Collabo CRM" }];
}

const CARD = "overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border";

export default function DeliveryAnalyticsPage() {
  const { data, isLoading, isError, refetch } = useDeliveryAnalytics();

  if (isError && !data) {
    return (
      <div className={cn(CARD, "p-10")}>
        <QueryErrorState resource="delivery analytics" onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Delivery analytics</PageHeaderTitle>
          <PageHeaderDescription>
            Speed, reliability, and what shipping is costing you.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="outline" size="sm">
            <Download className="size-3.5" />
            Download report
          </Button>
        </PageHeaderActions>
      </PageHeader>

      {/* Stat row */}
      <div className="grid grid-cols-1 gap-5 rounded-xl bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading || !data
          ? Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="p-5">
                <Skeleton className="mb-4 h-3 w-24" />
                <Skeleton className="h-7 w-20" />
              </div>
            ))
          : [
              { label: "On-time delivery", value: formatPercent(data.onTimeRate) },
              { label: "Avg transit", value: formatTat(data.avgTransitDays) },
              {
                label: "Shipping spend",
                value: formatCurrency(data.spend, data.currency, { maximumFractionDigits: 0 }),
              },
              {
                label: "Cost per parcel",
                value: formatCurrency(data.costPerParcel, data.currency),
              },
            ].map((stat, index, all) => (
              <div key={stat.label} className="flex items-center gap-4">
                <StatCard variant="inline" label={stat.label} value={stat.value} className="flex-1" />
                {index < all.length - 1 && (
                  <Separator orientation="vertical" className="hidden h-15 md:block" />
                )}
              </div>
            ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.4fr_1fr]">
        {/* Delivered vs delayed */}
        <div className={cn(CARD, "p-5")}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-body font-semibold text-foreground">Delivered vs delayed</p>
            <p className="text-caption text-muted-foreground">Last 30 days</p>
          </div>

          {isLoading || !data ? (
            <Skeleton className="mt-5 h-44 w-full" />
          ) : (
            <DeliveryColumns daily={data.daily} />
          )}
        </div>

        {/* Carrier scorecard */}
        <div className={CARD}>
          <div className="border-b px-4 py-3">
            <p className="text-body font-semibold text-foreground">Carrier scorecard</p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              On-time share and cost per parcel
            </p>
          </div>

          <div className="space-y-3.5 px-4 py-4">
            {isLoading || !data
              ? Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-6 w-full" />
                ))
              : data.carrierScores.map((score) => (
                  <div key={score.carrierId} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 truncate text-caption text-foreground">
                      {score.name}
                    </span>
                    <SplitTrack primaryPercent={score.onTimePct} className="flex-1" />
                    <span className="w-10 shrink-0 text-right text-caption tabular-nums text-muted-foreground">
                      {score.onTimePct.toFixed(0)}%
                    </span>
                    <span className="w-14 shrink-0 text-right text-caption font-semibold tabular-nums text-foreground">
                      {formatCurrency(score.cost, data.currency, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
          </div>

          {data && (
            <p className="border-t bg-muted px-4 py-3 text-caption text-muted-foreground">
              {data.carrierInsight}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* Slowest routes */}
        <div className={CARD}>
          <div className="border-b px-4 py-3">
            <p className="text-body font-semibold text-foreground">Slowest routes</p>
          </div>

          {isLoading || !data ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-6 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y">
              {data.slowestRoutes.map((route) => (
                <li key={route.route} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate text-body text-foreground">
                    {route.route}
                  </span>
                  <span className="shrink-0 text-body font-semibold tabular-nums text-foreground">
                    {route.days.toFixed(1)} days
                  </span>
                  <span className="w-20 shrink-0 text-right text-caption tabular-nums text-muted-foreground">
                    {route.volume} parcels
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Where spend goes */}
        <div className={CARD}>
          <div className="border-b px-4 py-3">
            <p className="text-body font-semibold text-foreground">Where spend goes</p>
          </div>

          <div className="space-y-3.5 px-4 py-4">
            {isLoading || !data
              ? Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-8 w-full" />
                ))
              : data.spendBreakdown.map((row) => (
                  <MeterRow
                    key={row.label}
                    label={row.label}
                    value={formatCurrency(row.amount, data.currency, { maximumFractionDigits: 0 })}
                    percent={row.percent}
                    tone={row.tone}
                  />
                ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Thirty stacked columns — late on top of on-time.
 *
 * Hand-drawn divs rather than Recharts: each column is two rectangles of a
 * known percentage, there are no axes to compute, and a charting library for
 * that is 100 kB to draw sixty boxes.
 */
function DeliveryColumns({ daily }: { daily: DeliveryAnalytics["daily"] }) {
  const peak = Math.max(...daily.map((day) => day.onTime + day.late), 1);

  return (
    <>
      <div className="mt-5 flex h-44 items-end gap-1">
        {daily.map((day) => {
          const total = day.onTime + day.late;
          return (
            <div
              key={day.date}
              className="flex h-full flex-1 flex-col justify-end gap-0.5"
              title={`${day.date}: ${day.onTime} on time, ${day.late} late`}
            >
              <div
                className="rounded-t-sm bg-danger/55"
                // Computed geometry — the sanctioned use of an inline style.
                style={{ height: `${(day.late / peak) * 100}%` }}
              />
              <div
                className="rounded-t-sm bg-brand"
                style={{ height: `${(day.onTime / peak) * 100}%` }}
              />
              <span className="sr-only">
                {day.date}: {total} delivered, {day.late} late
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-micro tabular-nums text-muted-foreground">
        <span>{formatDay(daily[0]?.date)}</span>
        <span>{formatDay(daily[Math.floor(daily.length / 2)]?.date)}</span>
        <span>{formatDay(daily[daily.length - 1]?.date)}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-caption text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Swatch tone="brand" />
          Delivered on time
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch tone="danger" />
          Delivered late
        </span>
      </div>
    </>
  );
}

function formatDay(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
