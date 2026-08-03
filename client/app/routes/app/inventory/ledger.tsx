import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, History, MoveRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { EmptyState } from "~/components/app/empty-state";
import { QueryErrorState } from "~/components/app/query-error-state";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { useInventoryLedger, useWarehouses } from "~/hooks/use-inventory-queries";
import type { InventoryEvent, LedgerParams } from "~/types/api";

const PAGE_SIZE = 25;

const REASONS = [
  "sale",
  "restock",
  "sync",
  "webhook",
  "adjustment",
  "count",
  "damage",
  "found",
  "correction",
  "initial",
  "migration",
] as const;

/** Human phrasing for a movement row. */
function describeMovement(e: InventoryEvent): string {
  if (e.fromBucket && e.toBucket) return `${e.fromBucket} → ${e.toBucket}`;
  if (e.toBucket) return `In → ${e.toBucket}`;
  if (e.fromBucket) return `${e.fromBucket} → Out`;
  // Legacy row: signed aggregate change.
  return e.changeAmount > 0 ? `+${e.changeAmount}` : String(e.changeAmount);
}

export default function InventoryLedgerPage() {
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");

  const params: LedgerParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      reason: reason === "all" ? undefined : reason,
      warehouseId: warehouseId === "all" ? undefined : warehouseId,
    }),
    [page, reason, warehouseId],
  );

  const ledger = useInventoryLedger(params);
  const warehouses = useWarehouses();
  const rows = ledger.data?.data ?? [];
  const meta = ledger.data?.meta;
  const warehouseName = (id: string | null) =>
    id ? (warehouses.data ?? []).find((w) => w.id === id)?.name ?? id : "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/inventory">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Movement ledger</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={reason}
          onValueChange={(v) => {
            setReason(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[150px] rounded-lg border border-input bg-white dark:bg-gray-900 px-3 text-xs shadow-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reasons</SelectItem>
            {REASONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={warehouseId}
          onValueChange={(v) => {
            setWarehouseId(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[170px] rounded-lg border border-input bg-white dark:bg-gray-900 px-3 text-xs shadow-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All warehouses</SelectItem>
            {(warehouses.data ?? []).map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {ledger.isLoading ? (
        <TableSkeleton rows={10} columns={6} />
      ) : ledger.isError ? (
        <QueryErrorState resource="the movement ledger" onRetry={() => ledger.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="No movements yet"
          description="Every stock change — sales, restocks, adjustments, sync corrections — appears here with its before/after quantities."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">When</th>
                <th className="px-3 py-2.5 font-medium">Product</th>
                <th className="px-3 py-2.5 font-medium">SKU</th>
                <th className="px-3 py-2.5 font-medium">Movement</th>
                <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                <th className="px-3 py-2.5 text-right font-medium">Sellable</th>
                <th className="px-3 py-2.5 font-medium">Reason</th>
                <th className="px-3 py-2.5 font-medium">Warehouse</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {e.productTitle ?? <span className="text-muted-foreground italic">deleted variant</span>}
                    </p>
                    {e.variantTitle && e.variantTitle !== "Default Title" && (
                      <p className="text-[10px] text-muted-foreground">{e.variantTitle}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono">{e.sku ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-medium">
                      {e.fromBucket || e.toBucket ? <MoveRight className="size-3" /> : null}
                      {describeMovement(e)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {e.movedQty ?? Math.abs(e.changeAmount)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {e.quantityBefore} → {e.quantityAfter}
                  </td>
                  <td className="px-3 py-2.5 capitalize">{e.reason}</td>
                  <td className="px-3 py-2.5">{warehouseName(e.warehouseId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {meta.page} of {meta.totalPages} · {meta.total} movements
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
