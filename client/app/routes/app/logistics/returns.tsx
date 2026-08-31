import { useState } from "react";
import { Link } from "react-router";
import { Loader2, RotateCcw } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "~/components/ui/page-header";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { EmptyState } from "~/components/app/empty-state";
import { QueryErrorState } from "~/components/app/query-error-state";
import { StatCard } from "~/components/app/stat-card";
import { MeterRow } from "~/components/app/logistics/meter-bar";
import { StackedCell, StatusPill } from "~/components/app/logistics/status-pill";
import { useReturnsOverview } from "~/hooks/use-logistics-queries";
import {
  RETURN_KIND_LABELS,
  RETURN_STAGE_CLASSES,
  RETURN_STAGE_LABELS,
} from "~/lib/logistics-status";
import { formatPercent } from "~/lib/logistics-format";
import { cn, formatCurrency } from "~/lib/utils";
import type { ReturnStage } from "~/types/api";

export function meta() {
  return [{ title: "Returns & RTO | Collabo CRM" }];
}

const CARD = "overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border";

const TABS: { value: ReturnStage | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "REQUESTED", label: "Requested" },
  { value: "IN_TRANSIT", label: "In transit" },
  { value: "RECEIVED", label: "Received" },
  { value: "REFUNDED", label: "Refunded" },
];

export default function ReturnsPage() {
  const [tab, setTab] = useState<ReturnStage | "ALL">("ALL");
  const { data, isLoading, isError, refetch } = useReturnsOverview();

  if (isError && !data) {
    return (
      <div className={cn(CARD, "p-10")}>
        <QueryErrorState resource="returns" onRetry={() => refetch()} />
      </div>
    );
  }

  const rows = (data?.returns ?? []).filter((record) => tab === "ALL" || record.stage === tab);

  return (
    <div className="space-y-4">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Returns &amp; RTO</PageHeaderTitle>
          <PageHeaderDescription>
            Customer returns and parcels coming back to origin.
          </PageHeaderDescription>
        </PageHeaderContent>
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
              { label: "Open returns", value: String(data.openReturns) },
              { label: "RTO in transit", value: String(data.rtoInTransit) },
              { label: "RTO rate", value: formatPercent(data.rtoRate) },
              {
                label: "Refunds pending",
                value: formatCurrency(data.refundsPending, data.currency, {
                  maximumFractionDigits: 0,
                }),
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

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.6fr_1fr]">
        {/* Returns table */}
        <div className={CARD}>
          <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2.5">
            {TABS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setTab(item.value)}
                aria-pressed={tab === item.value}
                className={cn(
                  "rounded-full px-3 py-1.5 text-caption font-medium transition-colors",
                  tab === item.value
                    ? "bg-brand font-semibold text-brand-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-8 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={RotateCcw}
                title="Nothing at this stage"
                description="Returns move through here as customers raise them and parcels come back."
                action={
                  tab !== "ALL" ? (
                    <Button variant="outline" size="sm" onClick={() => setTab("ALL")}>
                      Show all returns
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b">
                    <Th>Order</Th>
                    <Th>Reason</Th>
                    <Th className="hidden md:table-cell">Type</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Refund</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record) => (
                    <tr key={record.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <StackedCell primary={record.orderName} secondary={record.customerName} />
                      </td>
                      <td className="px-4 py-3 text-body text-foreground">{record.reason}</td>
                      <td className="hidden px-4 py-3 text-caption text-muted-foreground md:table-cell">
                        {RETURN_KIND_LABELS[record.kind]}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill
                          label={RETURN_STAGE_LABELS[record.stage]}
                          className={RETURN_STAGE_CLASSES[record.stage]}
                        />
                      </td>
                      <td className="px-4 py-3 text-right text-body font-medium tabular-nums text-foreground">
                        {formatCurrency(record.refundAmount, record.currency, {
                          maximumFractionDigits: 0,
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/orders/${record.orderId}`}
                          className="text-caption font-medium text-brand-strong hover:underline"
                        >
                          {record.actionLabel}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Why parcels come back */}
        <div className={CARD}>
          <div className="border-b px-4 py-3">
            <p className="text-body font-semibold text-foreground">Why parcels come back</p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              Last 90 days · {data?.reasonSampleSize ?? 0} returns
            </p>
          </div>

          <div className="space-y-3.5 px-4 py-4">
            {isLoading || !data ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              data.reasons.map((reason) => (
                <MeterRow
                  key={reason.label}
                  label={reason.label}
                  value={formatPercent(reason.percent, 0)}
                  percent={reason.percent}
                  tone={reason.tone}
                />
              ))
            )}
          </div>

          {data && (
            <p className="border-t bg-muted px-4 py-3 text-caption text-muted-foreground">
              {data.insight}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn("px-4 py-2.5 text-caption font-medium text-muted-foreground", className)}
    >
      {children}
    </th>
  );
}
