import { MapPin, Plus, Search } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "~/components/ui/page-header";
import { Skeleton } from "~/components/ui/skeleton";
import { QueryErrorState } from "~/components/app/query-error-state";
import { StackedTrack, Swatch } from "~/components/app/logistics/meter-bar";
import { useZonesOverview } from "~/hooks/use-logistics-queries";
import { cn, formatCurrency } from "~/lib/utils";
import type { DeliveryZone } from "~/types/api";

export function meta() {
  return [{ title: "Zones & delivery areas | Collabo CRM" }];
}

const CARD = "overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border";

export default function ZonesPage() {
  const { data, isLoading, isError, refetch } = useZonesOverview();

  if (isError && !data) {
    return (
      <div className={cn(CARD, "p-10")}>
        <QueryErrorState resource="delivery zones" onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Zones &amp; delivery areas</PageHeaderTitle>
          <PageHeaderDescription>
            What you charge a customer at checkout, and where you can actually deliver.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="outline" size="sm">
            <Search className="size-3.5" />
            Check a pincode
          </Button>
          <Button variant="accent" size="sm">
            <Plus className="size-3.5" />
            Add zone
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* Zones and their checkout rates */}
        <div className="space-y-4">
          {isLoading || !data
            ? Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-36 rounded-xl" />
              ))
            : data.zones.map((zone) => (
                <ZoneCard key={zone.id} zone={zone} currency={data.currency} />
              ))}
        </div>

        <div className="space-y-4">
          {/* Serviceability share */}
          <div className={CARD}>
            <div className="border-b px-4 py-3">
              <p className="text-body font-semibold text-foreground">Serviceability</p>
              <p className="mt-0.5 text-caption text-muted-foreground">
                Share of orders by zone, last 30 days
              </p>
            </div>

            <div className="space-y-4 px-4 py-4">
              {isLoading || !data ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <>
                  <StackedTrack
                    segments={data.share.map((entry) => ({
                      id: entry.zoneId,
                      percent: entry.percent,
                      tone: entry.tone,
                    }))}
                  />

                  <ul className="space-y-2">
                    {data.share.map((entry) => (
                      <li key={entry.zoneId} className="flex items-center gap-2.5">
                        <Swatch tone={entry.tone} />
                        <span className="min-w-0 flex-1 truncate text-caption text-foreground">
                          {entry.name}
                        </span>
                        <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                          {entry.orders.toLocaleString("en-IN")} orders
                        </span>
                        <span className="w-10 shrink-0 text-right text-caption font-semibold tabular-nums text-foreground">
                          {entry.percent}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>

          {/* Blocked pincodes */}
          <div className={CARD}>
            <div className="border-b px-4 py-3">
              <p className="text-body font-semibold text-foreground">Non-serviceable pincodes</p>
            </div>

            {isLoading || !data ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <ul className="divide-y">
                {data.nonServiceable.map((entry) => (
                  <li key={entry.pincode} className="flex items-center gap-3 px-4 py-3">
                    <span className="shrink-0 font-mono text-caption font-semibold text-foreground">
                      {entry.pincode}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-caption text-foreground">{entry.place}</p>
                      <p className="truncate text-micro text-muted-foreground">{entry.note}</p>
                    </div>
                    <span className="shrink-0 text-caption font-medium text-danger">
                      {entry.blockedLabel}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="border-t bg-muted px-4 py-3 text-caption text-muted-foreground">
              Customers in these pincodes see &ldquo;Delivery not available&rdquo; at checkout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ZoneCard({ zone, currency }: { zone: DeliveryZone; currency: string }) {
  return (
    <div className={CARD}>
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Swatch tone={zone.tone} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-foreground">{zone.name}</p>
          <p className="truncate text-caption text-muted-foreground">{zone.coverage}</p>
        </div>
        <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
          {zone.transit}
        </span>
      </div>

      <ul className="divide-y">
        {zone.rates.map((rate) => (
          <li key={rate.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-foreground">{rate.name}</p>
              <p className="truncate text-micro text-muted-foreground">{rate.condition}</p>
            </div>
            <span className="shrink-0 text-body font-semibold tabular-nums text-foreground">
              {rate.price === 0
                ? "Free"
                : formatCurrency(rate.price, currency, { maximumFractionDigits: 0 })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
