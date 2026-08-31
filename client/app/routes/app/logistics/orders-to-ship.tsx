import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ClipboardList,
  ExternalLink,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  Printer,
  Truck,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "~/components/ui/page-header";
import { EmptyState } from "~/components/app/empty-state";
import { QueryErrorState } from "~/components/app/query-error-state";
import { SegmentedTabs } from "~/components/app/segmented-tabs";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { CreateShipmentDialog } from "~/components/app/logistics/create-shipment-dialog";
import {
  LogisticsTable,
  TableFooter,
  TableSearch,
  useRowSelection,
  type LogisticsColumn,
} from "~/components/app/logistics/logistics-table";
import { PaymentPill, StackedCell, StatusPill } from "~/components/app/logistics/status-pill";
import { useDebounced } from "~/hooks/use-debounced";
import {
  useShippableOrderCounts,
  useShippableOrders,
} from "~/hooks/use-logistics-queries";
import { useBulkOrderActionMutation } from "~/hooks/use-logistics-mutations";
import { describeSla, formatRelative, slaClasses } from "~/lib/logistics-format";
import {
  SHIPPABLE_STATUS_CLASSES,
  SHIPPABLE_STATUS_LABELS,
} from "~/lib/logistics-status";
import { useNow } from "~/hooks/use-now";
import { cn, formatCurrency } from "~/lib/utils";
import type { ShippableOrder, ShippableOrderStatus } from "~/types/api";

export function meta() {
  return [{ title: "Fulfilment queue | Collabo CRM" }];
}

const PAGE_SIZE = 12;

type Tab = ShippableOrderStatus | "ALL";

const TABS: { value: Tab; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "UNFULFILLED", label: "Unfulfilled" },
  { value: "READY_TO_PROCESS", label: "Ready to process" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "EXCEPTION", label: "Exception" },
];

export default function FulfilmentQueuePage() {
  const navigate = useNavigate();
  const now = useNow(60_000);

  const [tab, setTab] = useState<Tab>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [shipQueue, setShipQueue] = useState<string[] | null>(null);

  const debouncedSearch = useDebounced(search, 350);

  const params = useMemo(
    () => ({ page, limit: PAGE_SIZE, search: debouncedSearch || undefined, status: tab }),
    [page, debouncedSearch, tab],
  );

  const { data, isLoading, isError, refetch } = useShippableOrders(params);
  const { data: counts } = useShippableOrderCounts(params);
  const bulkAction = useBulkOrderActionMutation();

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const hasFilters = Boolean(debouncedSearch) || tab !== "ALL";

  // Selection resets whenever the visible set changes — see `useRowSelection`.
  const { selectedIds, toggleRow, toggleAll, clear } = useRowSelection(
    `${tab}|${debouncedSearch}|${page}`,
  );

  const selected = rows.filter((row) => selectedIds.has(row.id));
  const selectedItems = selected.reduce((sum, row) => sum + row.itemCount, 0);

  const columns: LogisticsColumn<ShippableOrder>[] = [
    {
      id: "order",
      header: "Order",
      cell: (row) => (
        <StackedCell primary={row.orderName} secondary={formatRelative(row.createdAt, now)} />
      ),
    },
    {
      id: "items",
      header: "Items",
      cell: (row) => (
        <span className="text-caption text-muted-foreground">
          {row.itemCount} {row.itemCount === 1 ? "item" : "items"}
        </span>
      ),
    },
    {
      id: "shipTo",
      header: "Ship to",
      cell: (row) => (
        <span className="text-body text-foreground">
          {row.customerName}
          <span className="text-muted-foreground"> · {row.destinationCity}</span>
        </span>
      ),
    },
    {
      id: "channel",
      header: "Channel",
      minWidth: "lg",
      cell: (row) => (
        <span className="text-caption text-muted-foreground">{row.channel?.name ?? "Direct"}</span>
      ),
    },
    {
      id: "payment",
      header: "Payment",
      cell: (row) => (
        <PaymentPill
          mode={row.paymentMode}
          amount={
            row.paymentMode === "COD"
              ? formatCurrency(row.orderValue, row.currency, { maximumFractionDigits: 0 })
              : undefined
          }
        />
      ),
    },
    {
      id: "age",
      header: "Ship by",
      cell: (row) => {
        const sla = describeSla(row.shipBy, now);
        return (
          <span
            className={cn(
              "text-caption tabular-nums",
              sla.isBreached
                ? "font-medium text-danger"
                : sla.isAtRisk
                  ? "font-medium text-warning-strong"
                  : "text-muted-foreground",
            )}
          >
            {sla.label}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      minWidth: "xl",
      cell: (row) => (
        <StatusPill
          label={SHIPPABLE_STATUS_LABELS[row.status]}
          className={SHIPPABLE_STATUS_CLASSES[row.status]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Fulfilment queue</PageHeaderTitle>
          <PageHeaderDescription>
            Paid orders with nothing shipped yet. Work top-down — the queue is sorted by dispatch
            promise.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="outline" size="sm">
            <Printer className="size-3.5" />
            Print pick list
          </Button>
          <Button variant="accent" size="sm" onClick={() => setShipQueue([])}>
            <Truck className="size-3.5" />
            Create shipment
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <SegmentedTabs
        items={TABS.map((item) => ({ ...item, count: counts?.[item.value] }))}
        value={tab}
        onChange={(next) => {
          setTab(next);
          setPage(1);
        }}
        ariaLabel="Filter orders by fulfilment state"
        behaviour="filter"
      />

      <div className="overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border">
        {/* The header row swaps to a selection bar once anything is ticked —
            same bar, so the table does not jump when you select. */}
        <div className="flex flex-wrap items-center gap-2.5 border-b px-4 py-3">
          {selectedIds.size > 0 ? (
            <>
              <span className="text-body font-semibold text-foreground">
                {selectedIds.size} selected
              </span>
              <span className="text-caption text-muted-foreground">
                · {selectedItems} {selectedItems === 1 ? "item" : "items"}
              </span>

              <div className="ml-auto flex flex-wrap gap-2">
                {/* Worked through one parcel at a time — see the dialog's own
                    note on why this is a queue rather than a batch. */}
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => setShipQueue([...selectedIds])}
                >
                  <Truck className="size-3.5" />
                  Buy labels ({selectedIds.size})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bulkAction.isPending || !selected.some((row) => row.status === "ON_HOLD")}
                  onClick={() =>
                    bulkAction.mutate(
                      { orderIds: [...selectedIds], action: "RELEASE_HOLD" },
                      { onSuccess: clear },
                    )
                  }
                >
                  <PlayCircle className="size-3.5" />
                  Release hold
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bulkAction.isPending}
                  onClick={() =>
                    bulkAction.mutate(
                      { orderIds: [...selectedIds], action: "HOLD" },
                      { onSuccess: clear },
                    )
                  }
                >
                  <PauseCircle className="size-3.5" />
                  Put on hold
                </Button>
                <Button variant="ghost" size="sm" onClick={clear}>
                  Clear
                </Button>
              </div>
            </>
          ) : (
            <>
              <TableSearch
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                placeholder="Search order, customer, city"
              />
              {meta && (
                <span className="ml-auto text-caption text-muted-foreground">
                  {meta.total} waiting
                </span>
              )}
            </>
          )}
        </div>

        {isError && !data ? (
          <div className="p-8">
            <QueryErrorState resource="the fulfilment queue" onRetry={() => refetch()} />
          </div>
        ) : isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={PAGE_SIZE} columns={7} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={ClipboardList}
              title={hasFilters ? "No orders match these filters" : "Nothing waiting to ship"}
              description={
                hasFilters
                  ? "Try a different tab, or clear the search."
                  : "Every synced order has a shipment. New orders land here as they arrive."
              }
              action={
                hasFilters ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setTab("ALL");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/orders">View all orders</Link>
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
              selectedIds={selectedIds}
              onToggleRow={toggleRow}
              onToggleAll={toggleAll}
              renderCard={(row) => (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body font-semibold text-foreground">{row.orderName}</span>
                    <StatusPill
                      label={describeSla(row.shipBy, now).label}
                      className={slaClasses(describeSla(row.shipBy, now))}
                    />
                  </div>
                  <p className="text-caption text-muted-foreground">
                    {row.customerName} · {row.destinationCity} · {row.itemCount} items
                  </p>
                  <div className="flex items-center gap-2">
                    <PaymentPill mode={row.paymentMode} />
                    <Button
                      variant="accent"
                      size="xs"
                      className="ml-auto"
                      onClick={() => setShipQueue([row.id])}
                    >
                      Ship
                    </Button>
                  </div>
                </div>
              )}
              rowActions={(row) => (
                <div className="flex items-center justify-end gap-1">
                  <Button variant="outline" size="xs" onClick={() => setShipQueue([row.id])}>
                    Ship
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${row.orderName}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuLabel className="text-caption">{row.orderName}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShipQueue([row.id])}>
                        <Truck className="mr-1.5 size-3.5" />
                        Create shipment
                      </DropdownMenuItem>
                      {row.status === "ON_HOLD" ? (
                        <DropdownMenuItem
                          onClick={() =>
                            bulkAction.mutate({ orderIds: [row.id], action: "RELEASE_HOLD" })
                          }
                        >
                          <PlayCircle className="mr-1.5 size-3.5" />
                          Release hold
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => bulkAction.mutate({ orderIds: [row.id], action: "HOLD" })}
                        >
                          <PauseCircle className="mr-1.5 size-3.5" />
                          Put on hold
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate(`/orders/${row.id}`)}>
                        <ExternalLink className="mr-1.5 size-3.5" />
                        Open order
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            />

            <TableFooter
              shown={rows.length}
              total={meta?.total ?? 0}
              noun="orders"
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
