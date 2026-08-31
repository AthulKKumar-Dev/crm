import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Download, MapPin, Package, Truck } from "lucide-react";

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
import { EmptyState } from "~/components/app/empty-state";
import { QueryErrorState } from "~/components/app/query-error-state";
import { StatCard } from "~/components/app/stat-card";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { CreateShipmentDialog } from "~/components/app/logistics/create-shipment-dialog";
import { FilterChip, SelectChip } from "~/components/app/logistics/filter-chip";
import {
  LogisticsTable,
  TableFooter,
  TableSearch,
  type LogisticsColumn,
} from "~/components/app/logistics/logistics-table";
import {
  PaymentPill,
  ShipmentStatusPill,
  StackedCell,
} from "~/components/app/logistics/status-pill";
import { useDebounced } from "~/hooks/use-debounced";
import {
  useCouriers,
  useLogisticsOverview,
  useShipments,
} from "~/hooks/use-logistics-queries";
import {
  formatDestination,
  formatPromiseDate,
  formatTat,
} from "~/lib/logistics-format";
import { SERVICE_TYPE_LABELS, SHIPMENT_STATUS_LABELS } from "~/lib/logistics-status";
import { useNow } from "~/hooks/use-now";
import { cn, formatCurrency } from "~/lib/utils";
import type { Shipment, ShipmentStatus } from "~/types/api";

export function meta() {
  return [
    { title: "Logistics | Collabo CRM" },
    { name: "description", content: "Every parcel in flight across your carriers." },
  ];
}

const PAGE_SIZE = 12;

const DATE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

/** The statuses worth offering as a chip filter — the transient ones are noise. */
const STATUS_OPTIONS: ShipmentStatus[] = [
  "READY_TO_SHIP",
  "PICKUP_SCHEDULED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELAYED",
  "NDR",
];

export default function ShipmentsPage() {
  const now = useNow(60_000);
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [courierIds, setCourierIds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState("all");
  const [shipQueue, setShipQueue] = useState<string[] | null>(null);

  const debouncedSearch = useDebounced(search, 350);

  const { data: couriers } = useCouriers();
  const { data: overview, isLoading: overviewLoading } = useLogisticsOverview();

  const params = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      courierId: courierIds.length ? courierIds : undefined,
      status: statuses.length ? (statuses as ShipmentStatus[]) : undefined,
      dateFrom: presetFrom(dateRange),
    }),
    [page, debouncedSearch, courierIds, statuses, dateRange],
  );

  const { data, isLoading, isError, refetch } = useShipments(params);

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const summary = overview?.summary;
  const hasFilters =
    Boolean(debouncedSearch) || courierIds.length > 0 || statuses.length > 0 || dateRange !== "all";

  function resetFilters() {
    setSearch("");
    setCourierIds([]);
    setStatuses([]);
    setDateRange("all");
    setSearchParams({}, { replace: true });
    setPage(1);
  }

  const columns: LogisticsColumn<Shipment>[] = [
    {
      id: "order",
      header: "Order",
      cell: (row) => (
        <span className="text-body font-semibold text-foreground">{row.orderName}</span>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      cell: (row) => <span className="text-body text-foreground">{row.customerName}</span>,
    },
    {
      id: "carrier",
      header: "Carrier / AWB",
      cell: (row) => (
        <StackedCell
          primary={
            row.courierName
              ? `${row.courierName}${row.serviceType ? ` ${SERVICE_TYPE_LABELS[row.serviceType]}` : ""}`
              : "Not assigned"
          }
          secondary={row.awb ?? "No AWB yet"}
          secondaryMono
        />
      ),
    },
    {
      id: "destination",
      header: "Destination",
      minWidth: "md",
      cell: (row) => (
        <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          {formatDestination(row)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => <ShipmentStatusPill status={row.status} showDot={false} />,
    },
    {
      id: "eta",
      header: "ETA",
      minWidth: "lg",
      cell: (row) => (
        <span
          className={cn(
            "text-caption tabular-nums",
            row.isDelayed ? "font-medium text-warning-strong" : "text-foreground",
          )}
        >
          {row.status === "DELIVERED" ? "—" : formatPromiseDate(row.expectedDeliveryAt, now)}
        </span>
      ),
    },
    {
      id: "payment",
      header: "Payment",
      minWidth: "xl",
      cell: (row) => <PaymentPill mode={row.paymentMode} />,
    },
    {
      id: "cost",
      header: "Cost",
      align: "right",
      minWidth: "lg",
      cell: (row) => (
        <span className="tabular-nums text-foreground">
          {formatCurrency(row.shippingCost, row.currency, { maximumFractionDigits: 0 })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Shipments</PageHeaderTitle>
          <PageHeaderDescription>
            Every parcel in flight across your carriers and channels.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="outline" size="sm">
            <Download className="size-3.5" />
            Export CSV
          </Button>
          {/* Opens the dialog on its order picker — this page has no row
              context, so navigating to the queue first would cost a page load
              just to choose one. */}
          <Button variant="accent" size="sm" onClick={() => setShipQueue([])}>
            <Truck className="size-3.5" />
            New shipment
          </Button>
        </PageHeaderActions>
      </PageHeader>

      {/* Stat row — one wrapper card with inline tiles and vertical rules, the
          composition Orders and Invoices already use. */}
      <div className="grid grid-cols-1 gap-5 rounded-xl bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        {overviewLoading
          ? Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="p-5">
                <Skeleton className="mb-4 h-3 w-24" />
                <Skeleton className="h-7 w-20" />
              </div>
            ))
          : [
              { label: "In transit", value: String(summary?.inTransit ?? 0) },
              { label: "Awaiting pickup", value: String(summary?.pickupPending ?? 0) },
              { label: "Delayed", value: String(summary?.delayed ?? 0) },
              {
                label: "Avg delivery time",
                value: formatTat(
                  overview?.courierPerformance.length
                    ? overview.courierPerformance.reduce((sum, row) => sum + row.avgTat, 0) /
                        overview.courierPerformance.length
                    : 0,
                ),
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

      {/* Table card */}
      <div className="overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border">
        <div className="flex flex-wrap items-center gap-2.5 border-b px-4 py-3">
          <TableSearch
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search AWB, order, customer"
          />

          <div className="ml-auto flex flex-wrap gap-2">
            <FilterChip
              label="Carrier"
              options={(couriers ?? []).map((courier) => ({
                value: courier.id,
                label: courier.name,
              }))}
              selected={courierIds}
              onChange={(next) => {
                setCourierIds(next);
                setPage(1);
              }}
            />
            <FilterChip
              label="Status"
              options={STATUS_OPTIONS.map((status) => ({
                value: status,
                label: SHIPMENT_STATUS_LABELS[status],
              }))}
              selected={statuses}
              onChange={(next) => {
                setStatuses(next);
                setPage(1);
              }}
            />
            <SelectChip
              options={DATE_OPTIONS}
              value={dateRange}
              onChange={(next) => {
                setDateRange(next);
                setPage(1);
              }}
            />
          </div>
        </div>

        {/* Error before loading before empty: a failed request leaves isLoading
            false and data undefined, so an empty-first branch would claim the
            account has no shipments when the request actually failed. */}
        {isError && !data ? (
          <div className="p-8">
            <QueryErrorState resource="shipments" onRetry={() => refetch()} />
          </div>
        ) : isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={PAGE_SIZE} columns={7} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Package}
              title={hasFilters ? "No shipments match these filters" : "No shipments yet"}
              description={
                hasFilters
                  ? "Try widening the carrier or status filter."
                  : "Create your first shipment from an unfulfilled order."
              }
              action={
                hasFilters ? (
                  <Button variant="outline" size="sm" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button asChild variant="accent" size="sm">
                    <Link to="/logistics/orders-to-ship">View the fulfilment queue</Link>
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <>
            <LogisticsTable
              rows={rows}
              columns={columns}
              rowId={(row) => row.id}
              rowHref={(row) => `/logistics/shipments/${row.id}`}
              renderCard={(row) => (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body font-semibold text-foreground">{row.orderName}</span>
                    <ShipmentStatusPill status={row.status} showDot={false} />
                  </div>
                  <p className="text-caption text-muted-foreground">
                    {row.customerName} · {formatDestination(row)}
                  </p>
                  <p className="font-mono text-micro text-muted-foreground">
                    {row.courierName ?? "No carrier"} · {row.awb ?? "No AWB"}
                  </p>
                </div>
              )}
            />

            <TableFooter
              shown={rows.length}
              total={meta?.total ?? 0}
              noun="shipments"
              page={meta?.page ?? 1}
              totalPages={meta?.totalPages ?? 1}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <CreateShipmentDialog
        open={shipQueue !== null}
        orderIds={shipQueue ?? []}
        onOpenChange={(open) => !open && setShipQueue(null)}
      />
    </div>
  );
}

/** ISO date N days back, for the non-"all" presets. */
function presetFrom(preset: string): string | undefined {
  if (preset === "all") return undefined;
  const days = preset === "7d" ? 7 : 30;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}
