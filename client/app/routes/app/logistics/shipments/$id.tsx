import { Link, useParams } from "react-router";
import {
  ChevronLeft,
  ExternalLink,
  Loader2,
  MessageSquare,
  Package,
  Printer,
  Truck,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { QueryErrorState } from "~/components/app/query-error-state";
import { AwbPanel } from "~/components/app/logistics/document-actions";
import {
  LogisticsTimeline,
  ShipmentProgressRail,
} from "~/components/app/logistics/logistics-timeline";
import { PaymentPill, ShipmentStatusPill } from "~/components/app/logistics/status-pill";
import { useShipmentDetail } from "~/hooks/use-logistics-queries";
import { useNow } from "~/hooks/use-now";
import {
  addressLines,
  formatDimensions,
  formatPromiseDate,
  formatRelative,
  formatWeight,
} from "~/lib/logistics-format";
import { SERVICE_TYPE_LABELS } from "~/lib/logistics-status";
import { cn, formatCurrency } from "~/lib/utils";

export function meta() {
  return [{ title: "Shipment | Collabo CRM" }];
}

/** The card surface the whole design is built from. */
const CARD = "overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border";
const CARD_HEADER = "flex items-center justify-between gap-3 border-b px-4 py-3";

export default function ShipmentDetailPage() {
  const { id } = useParams();
  const now = useNow(60_000);
  const { data: shipment, isLoading, isError, refetch } = useShipmentDetail(id);

  // Error before loading: a failed request leaves isLoading false and data
  // undefined, and the loading branch would spin forever on a 404.
  if (isError && !shipment) {
    return (
      <div className={cn(CARD, "p-10")}>
        <QueryErrorState resource="this shipment" onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading || !shipment) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const lastEvent = shipment.events[shipment.events.length - 1];

  return (
    <div className="space-y-4">
      <Link
        to="/logistics"
        className="inline-flex items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        All shipments
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-subhead text-foreground">
              Shipment <span className="font-mono">{shipment.awb ?? shipment.reference}</span>
            </h1>
            <ShipmentStatusPill status={shipment.status} showDot={false} />
          </div>
          <p className="mt-1 text-caption text-muted-foreground">
            Order{" "}
            <Link to={`/orders/${shipment.orderId}`} className="text-brand-strong hover:underline">
              {shipment.orderName}
            </Link>{" "}
            · {shipment.customerName}
            {shipment.courierName &&
              ` · ${shipment.courierName}${shipment.serviceType ? ` ${SERVICE_TYPE_LABELS[shipment.serviceType]}` : ""}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!shipment.awb}>
            <Printer className="size-3.5" />
            Print label
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/conversation">
              <MessageSquare className="size-3.5" />
              Message customer
            </Link>
          </Button>
          {shipment.trackingUrl && (
            <Button asChild variant="accent" size="sm">
              <a href={shipment.trackingUrl} target="_blank" rel="noreferrer noopener">
                <Truck className="size-3.5" />
                Track on carrier
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          {/* Tracking */}
          <div className={CARD}>
            <div className={CARD_HEADER}>
              <span className="text-body font-semibold text-foreground">Tracking</span>
              <span className="text-caption text-muted-foreground">
                {lastEvent && `Last scan ${formatRelative(lastEvent.occurredAt, now)}`}
                {shipment.expectedDeliveryAt &&
                  shipment.status !== "DELIVERED" &&
                  ` · ETA ${formatPromiseDate(shipment.expectedDeliveryAt, now)}`}
              </span>
            </div>

            <div className="p-5">
              <ShipmentProgressRail status={shipment.status} className="mb-6" />
              <LogisticsTimeline events={shipment.events} />
            </div>
          </div>

          {/* AWB — generate / loading / failed / retry */}
          <div className={cn(CARD, "p-4")}>
            <AwbPanel shipment={shipment} />
          </div>

          {/* Parcel contents */}
          <div className={CARD}>
            <div className={CARD_HEADER}>
              <span className="text-body font-semibold text-foreground">Parcel contents</span>
            </div>

            <ul className="divide-y">
              {shipment.lineItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Package className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-foreground">
                      {item.title}
                    </span>
                    <span className="block truncate font-mono text-micro text-muted-foreground">
                      SKU {item.sku}
                    </span>
                  </span>
                  <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                    × {item.quantity}
                  </span>
                  <span className="w-20 shrink-0 text-right text-caption font-medium tabular-nums text-foreground">
                    {formatCurrency(item.price * item.quantity, shipment.currency, {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted px-4 py-3">
              <span className="text-caption text-muted-foreground">
                Declared value · {formatWeight(shipment.chargeableWeight)}
                {shipment.packages[0] && ` · ${formatDimensions(shipment.packages[0])}`}
              </span>
              <span className="text-body font-semibold tabular-nums text-foreground">
                {formatCurrency(shipment.orderValue, shipment.currency, {
                  maximumFractionDigits: 0,
                })}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Delivery address */}
          <div className={CARD}>
            <div className={CARD_HEADER}>
              <span className="text-body font-semibold text-foreground">Delivery address</span>
            </div>

            <address className="px-4 py-3 not-italic text-body leading-relaxed text-foreground">
              {shipment.destination.name}
              <br />
              {addressLines(shipment.destination).map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              <span className="text-muted-foreground">{shipment.destination.phone}</span>
            </address>

            <div className="flex gap-2 border-t bg-muted px-4 py-3">
              <Button asChild variant="outline" size="xs" className="bg-card">
                <Link to={`/orders/${shipment.orderId}`}>
                  <ExternalLink className="size-3" />
                  Open order
                </Link>
              </Button>
              {shipment.customerId && (
                <Button asChild variant="ghost" size="xs">
                  <Link to={`/orders/customers/${shipment.customerId}`}>Open customer</Link>
                </Button>
              )}
            </div>
          </div>

          {/* Shipping charges */}
          <div className={CARD}>
            <div className={CARD_HEADER}>
              <span className="text-body font-semibold text-foreground">Shipping charges</span>
            </div>

            <dl className="space-y-2.5 px-4 py-3">
              {shipment.costBreakdown.map((line) => (
                <div key={line.label} className="flex justify-between gap-3">
                  <dt className="text-caption text-muted-foreground">{line.label}</dt>
                  <dd className="text-caption tabular-nums text-foreground">
                    {formatCurrency(line.amount, shipment.currency, { maximumFractionDigits: 0 })}
                  </dd>
                </div>
              ))}

              <div className="h-px bg-border" />

              <div className="flex justify-between gap-3">
                <dt className="text-body font-semibold text-foreground">Charged</dt>
                <dd className="text-body font-semibold tabular-nums text-foreground">
                  {formatCurrency(shipment.shippingCost, shipment.currency, {
                    maximumFractionDigits: 0,
                  })}
                </dd>
              </div>
            </dl>
          </div>

          {/* Shipment facts */}
          <div className={CARD}>
            <div className={CARD_HEADER}>
              <span className="text-body font-semibold text-foreground">Shipment</span>
            </div>

            <dl className="divide-y">
              <Fact label="Payment">
                <PaymentPill
                  mode={shipment.paymentMode}
                  amount={
                    shipment.paymentMode === "COD"
                      ? formatCurrency(shipment.codAmount, shipment.currency, {
                          maximumFractionDigits: 0,
                        })
                      : undefined
                  }
                />
              </Fact>
              <Fact label="Picked up from">{shipment.pickupLocationName}</Fact>
              <Fact label="Packages">
                {shipment.packageCount} · {formatWeight(shipment.chargeableWeight)}
              </Fact>
              <Fact label="Created">{formatRelative(shipment.createdAt, now)}</Fact>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-caption text-foreground">{children}</dd>
    </div>
  );
}
