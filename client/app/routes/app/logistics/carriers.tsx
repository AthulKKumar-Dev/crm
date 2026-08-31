import { Plus, Truck } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "~/components/ui/page-header";
import { Skeleton } from "~/components/ui/skeleton";
import { EmptyState } from "~/components/app/empty-state";
import { QueryErrorState } from "~/components/app/query-error-state";
import { StatusPill } from "~/components/app/logistics/status-pill";
import { useCarriersOverview } from "~/hooks/use-logistics-queries";
import { formatPercent } from "~/lib/logistics-format";
import { CARRIER_STATE_CLASSES, CARRIER_STATE_LABELS } from "~/lib/logistics-status";
import { cn, formatCurrency } from "~/lib/utils";
import type { CarrierAccount } from "~/types/api";

export function meta() {
  return [{ title: "Carriers & rates | Collabo CRM" }];
}

const CARD = "overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border";

export default function CarriersPage() {
  const { data, isLoading, isError, refetch } = useCarriersOverview();

  if (isError && !data) {
    return (
      <div className={cn(CARD, "p-10")}>
        <QueryErrorState resource="carriers" onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Carriers &amp; rates</PageHeaderTitle>
          <PageHeaderDescription>
            Connected accounts, negotiated rates, and the rule that picks a carrier for you.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="accent" size="sm">
            <Plus className="size-3.5" />
            Connect a carrier
          </Button>
        </PageHeaderActions>
      </PageHeader>

      {/* Carrier cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading || !data
          ? Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-44 rounded-xl" />
            ))
          : data.carriers.map((carrier) => (
              <CarrierCard key={carrier.id} carrier={carrier} currency={data.currency} />
            ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.3fr_1fr]">
        {/* Rate card */}
        <div className={CARD}>
          <div className="border-b px-4 py-3">
            <p className="text-body font-semibold text-foreground">Rate card</p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              Negotiated forward rates, per 500 g slab, zone B
            </p>
          </div>

          {isLoading || !data ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b">
                    <Th>Service</Th>
                    <Th className="text-right">Base</Th>
                    <Th className="hidden text-right sm:table-cell">Additional 500g</Th>
                    <Th className="hidden text-right md:table-cell">COD fee</Th>
                    <Th className="hidden text-right lg:table-cell">RTO</Th>
                    <Th className="text-right">Transit</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.rateCard.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <span className="block text-body font-medium text-foreground">
                          {row.service}
                        </span>
                        <span className="block text-micro text-muted-foreground">
                          {row.carrierName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-body tabular-nums text-foreground">
                        {formatCurrency(row.base, data.currency, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="hidden px-4 py-3 text-right text-body tabular-nums text-foreground sm:table-cell">
                        {formatCurrency(row.additional, data.currency, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="hidden px-4 py-3 text-right text-caption text-muted-foreground md:table-cell">
                        {row.codFee}
                      </td>
                      <td className="hidden px-4 py-3 text-right text-caption text-muted-foreground lg:table-cell">
                        {row.rtoCharge}
                      </td>
                      <td className="px-4 py-3 text-right text-caption text-foreground">
                        {row.transit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selection rules */}
        <div className={CARD}>
          <div className="border-b px-4 py-3">
            <p className="text-body font-semibold text-foreground">Carrier selection rules</p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              Applied top to bottom when a label is bought
            </p>
          </div>

          {isLoading || !data ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : data.rules.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Truck}
                title="No rules yet"
                description="Without rules, every shipment needs a carrier picked by hand."
              />
            </div>
          ) : (
            <ol className="divide-y">
              {data.rules.map((rule) => (
                <li key={rule.id} className="flex gap-3 px-4 py-3">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-micro font-semibold tabular-nums text-muted-foreground">
                    {rule.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-foreground">{rule.when}</p>
                    <p className="mt-0.5 text-caption text-muted-foreground">{rule.then}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-caption font-medium",
                      rule.state === "ACTIVE" ? "text-brand-strong" : "text-muted-foreground",
                    )}
                  >
                    {rule.state === "ACTIVE" ? "Active" : "Fallback"}
                  </span>
                </li>
              ))}
            </ol>
          )}

          <div className="border-t bg-muted px-4 py-3">
            <Button variant="outline" size="sm" className="bg-card">
              <Plus className="size-3.5" />
              Add rule
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CarrierCard({ carrier, currency }: { carrier: CarrierAccount; currency: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-card p-4 shadow-sm ring-1 ring-border",
        carrier.state === "NOT_LINKED" && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink text-micro font-bold text-brand">
            {carrier.initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-body font-semibold text-foreground">{carrier.name}</p>
            <p className="truncate text-micro text-muted-foreground">{carrier.accountLabel}</p>
          </div>
        </div>
        <StatusPill
          label={CARRIER_STATE_LABELS[carrier.state]}
          className={CARRIER_STATE_CLASSES[carrier.state]}
        />
      </div>

      <dl className="flex gap-4">
        <Metric label="on-time" value={formatPercent(carrier.onTimeRate, 0)} />
        <Metric
          label="avg / parcel"
          value={formatCurrency(carrier.avgCost, currency, { maximumFractionDigits: 0 })}
        />
        <Metric label="30-day" value={carrier.volume30d.toLocaleString("en-IN")} />
      </dl>

      <div className="h-px bg-border" />

      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-caption text-muted-foreground">
          {carrier.services}
        </span>
        <button
          type="button"
          className="shrink-0 text-caption font-medium text-brand-strong hover:underline"
        >
          Manage
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="text-section tabular-nums text-foreground">{value}</dd>
      <dt className="text-micro text-muted-foreground">{label}</dt>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-4 py-2.5 text-caption font-medium text-muted-foreground", className)}>
      {children}
    </th>
  );
}
