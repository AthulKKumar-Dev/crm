import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Boxes,
  IndianRupee,
  AlertTriangle,
  PackageX,
  Printer,
  Barcode,
  Warehouse as WarehouseIcon,
  SlidersHorizontal,
  Search,
  History,
} from "lucide-react";
import { StatCard } from "~/components/app/stat-card";
import { EmptyState } from "~/components/app/empty-state";
import { QueryErrorState } from "~/components/app/query-error-state";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { ModalShell, DialogFooter } from "~/components/app/order-dialog-primitives";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useDebounced } from "~/hooks/use-debounced";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import {
  useInventoryStatus,
  useStock,
  useStockStats,
  useWarehouses,
} from "~/hooks/use-inventory-queries";
import {
  useCreateAdjustmentMutation,
  useEnableInventoryMutation,
  useGenerateBarcodesMutation,
  useGenerateSkusMutation,
} from "~/hooks/use-inventory-mutations";
import type { StockBucket, StockLine, StockListParams } from "~/types/api";

const PAGE_SIZE = 15;

const BUCKETS: StockBucket[] = ["AVAILABLE", "RESERVED", "QC", "DAMAGED"];

export default function InventoryPage() {
  const status = useInventoryStatus();

  if (status.isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Inventory</h1>
        <TableSkeleton rows={6} columns={5} />
      </div>
    );
  }
  if (status.isError || !status.data) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Inventory</h1>
        <QueryErrorState resource="inventory" onRetry={() => status.refetch()} />
      </div>
    );
  }
  if (!status.data.warehousingEnabled) {
    return <EnableInventoryCta seeding={status.data.seeding} />;
  }
  return <StockScreen />;
}

// ─────────────────────────── Enable CTA ───────────────────────────

function EnableInventoryCta({ seeding }: { seeding: boolean }) {
  const enable = useEnableInventoryMutation();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Inventory</h1>
      <EmptyState
        icon={WarehouseIcon}
        title={
          seeding
            ? "Setting up your warehouse…"
            : "Warehouse-grade inventory, off by default"
        }
        description={
          seeding
            ? "Seeding stock levels from your catalog. This page refreshes automatically."
            : "Track stock in buckets (available, reserved, QC, damaged), receive goods, print barcode labels, and pick with a scanner. Your current quantities are carried over exactly."
        }
        action={
          seeding ? (
            // The seed normally finishes on its own — but if the background
            // job died (e.g. a deploy or DB hiccup mid-seed) this state would
            // otherwise be a dead end. Enable is idempotent: it re-enqueues
            // the seed, which skips everything already committed.
            <Button
              variant="outline"
              size="sm"
              onClick={() => enable.mutate()}
              disabled={enable.isPending}
            >
              {enable.isPending ? "Restarting…" : "Taking too long? Retry setup"}
            </Button>
          ) : (
            <Button
              onClick={() => enable.mutate()}
              disabled={enable.isPending}
              className="bg-[#CEF17B] text-gray-900 hover:bg-[#b8e67d]"
            >
              {enable.isPending ? "Starting…" : "Enable warehousing"}
            </Button>
          )
        }
      />
    </div>
  );
}

// ─────────────────────────── Stock screen ───────────────────────────

function StockScreen() {
  const { data: currentOrg } = useCurrentOrg();
  const currency = currentOrg?.currency;
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 350);
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState<StockLine | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, warehouseId, stockFilter]);

  // Selection is by variant id and survives re-filtering, so without this the
  // "Print labels (n)" count keeps counting rows the user can no longer see —
  // and printing a sheet of labels for them is not a recoverable mistake.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [debouncedSearch, warehouseId, stockFilter, page]);

  const params: StockListParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      q: debouncedSearch || undefined,
      warehouseId: warehouseId === "all" ? undefined : warehouseId,
      stockFilter: stockFilter === "all" ? undefined : (stockFilter as StockListParams["stockFilter"]),
    }),
    [page, debouncedSearch, warehouseId, stockFilter],
  );

  const stock = useStock(params);
  const stats = useStockStats();
  const warehouses = useWarehouses();
  const generateSkus = useGenerateSkusMutation();
  const generateBarcodes = useGenerateBarcodesMutation();

  const rows = stock.data?.data ?? [];
  const meta = stock.data?.meta;

  const toggleSelect = (variantId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  };
  const toggleSelectAllOnPage = () => {
    const pageIds = rows.map((r) => r.variantId);
    const allSelected = pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(n);

  const labelHref =
    selectedIds.size > 0
      ? `/products/inventory/labels/print?variantIds=${[...selectedIds].join(",")}`
      : null;

  // Code generation acts on the selection when there is one, and on the whole
  // org otherwise. Counting the rows that actually LACK a code (rather than
  // the rows selected) lets each button say up front what it will change —
  // and lets it disable itself when the answer is "nothing", instead of
  // firing a request that reports zero.
  const selectedRows = rows.filter((r) => selectedIds.has(r.variantId));
  const hasSelection = selectedIds.size > 0;
  const missingSkuCount = selectedRows.filter((r) => !r.sku).length;
  const missingBarcodeCount = selectedRows.filter((r) => !r.barcode).length;
  const selectedVariantIds = [...selectedIds];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Inventory</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              generateSkus.mutate(
                hasSelection
                  ? { variantIds: selectedVariantIds }
                  : { filter: "missing-sku" },
              )
            }
            disabled={generateSkus.isPending || (hasSelection && missingSkuCount === 0)}
            title={
              hasSelection && missingSkuCount === 0
                ? "Every selected row already has a SKU"
                : undefined
            }
          >
            <SlidersHorizontal className="size-3.5" />
            {generateSkus.isPending
              ? "Generating…"
              : hasSelection
                ? `Generate SKUs (${missingSkuCount})`
                : "Generate all missing SKUs"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              generateBarcodes.mutate(
                hasSelection
                  ? { variantIds: selectedVariantIds }
                  : { filter: "missing-barcode" },
              )
            }
            disabled={
              generateBarcodes.isPending || (hasSelection && missingBarcodeCount === 0)
            }
            title={
              hasSelection && missingBarcodeCount === 0
                ? "Every selected row already has a barcode"
                : undefined
            }
          >
            <Barcode className="size-3.5" />
            {generateBarcodes.isPending
              ? "Generating…"
              : hasSelection
                ? `Generate barcodes (${missingBarcodeCount})`
                : "Generate all missing barcodes"}
          </Button>
          {labelHref ? (
            <Button asChild size="sm" className="bg-[#CEF17B] text-gray-900 hover:bg-[#b8e67d]">
              <Link to={labelHref} target="_blank">
                <Printer className="size-3.5" />
                Print labels ({selectedIds.size})
              </Link>
            </Button>
          ) : (
            <Button size="sm" disabled variant="outline" title="Select rows to print labels">
              <Printer className="size-3.5" />
              Print labels
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Units on hand"
          value={stats.data ? String(stats.data.unitsOnHand) : "—"}
          changeLabel={
            stats.data
              ? `${stats.data.unitsAvailable} available · ${stats.data.unitsReserved} reserved`
              : undefined
          }
          icon={<Boxes className="size-4" />}
        />
        <StatCard
          label="Known cost value"
          value={stats.data ? fmtMoney(stats.data.stockValue) : "—"}
          changeLabel="On-hand units × recorded cost"
          icon={<IndianRupee className="size-4" />}
        />
        <StatCard
          label="Low stock lines"
          value={stats.data ? String(stats.data.lowStockLines) : "—"}
          changeLabel={stats.data ? `Threshold: ${stats.data.lowStockThreshold}` : undefined}
          icon={<AlertTriangle className="size-4" />}
        />
        <StatCard
          label="Oversold lines"
          value={stats.data ? String(stats.data.oversoldLines) : "—"}
          changeLabel="Available below zero"
          icon={<PackageX className="size-4" />}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by SKU, barcode or title…"
            className="h-8 w-64 rounded-lg pl-8 text-xs"
          />
        </div>
        <Select value={warehouseId} onValueChange={setWarehouseId}>
          <SelectTrigger className="h-8 w-[170px] rounded-lg border border-input bg-white dark:bg-gray-900 px-3 text-xs shadow-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All warehouses</SelectItem>
            {(warehouses.data ?? []).map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name} ({w.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stockFilter} onValueChange={setStockFilter}>
          <SelectTrigger className="h-8 w-[140px] rounded-lg border border-input bg-white dark:bg-gray-900 px-3 text-xs shadow-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
            <SelectItem value="oversold">Oversold</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground">
            <Link to="/products/inventory/warehouses">
              <WarehouseIcon className="size-3.5" /> Warehouses
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground">
            <Link to="/products/inventory/ledger">
              <History className="size-3.5" /> Movement ledger
            </Link>
          </Button>
        </div>
      </div>

      {/* Table */}
      {stock.isLoading ? (
        <TableSkeleton rows={8} columns={8} />
      ) : stock.isError ? (
        <QueryErrorState resource="stock" onRetry={() => stock.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No stock lines found"
          description="Stock lines appear per variant per warehouse. Adjust filters, or receive stock once receiving ships."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="w-8 px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="accent-[#CEF17B]"
                    checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.variantId))}
                    onChange={toggleSelectAllOnPage}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">Product</th>
                <th className="px-3 py-2.5 font-medium">SKU / Barcode</th>
                <th className="px-3 py-2.5 font-medium">Warehouse</th>
                <th className="px-3 py-2.5 font-medium">Location</th>
                <th className="px-3 py-2.5 text-right font-medium">Available</th>
                <th className="px-3 py-2.5 text-right font-medium">Reserved</th>
                <th className="px-3 py-2.5 text-right font-medium">QC</th>
                <th className="px-3 py-2.5 text-right font-medium">Damaged</th>
                <th className="px-3 py-2.5 text-right font-medium">On hand</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((line) => (
                <tr key={line.id} className="border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="accent-[#CEF17B]"
                      checked={selectedIds.has(line.variantId)}
                      onChange={() => toggleSelect(line.variantId)}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {line.imageUrl ? (
                        <img src={line.imageUrl} alt="" className="size-8 rounded-md object-cover" />
                      ) : (
                        <div className="flex size-8 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
                          <Boxes className="size-3.5 text-gray-400" />
                        </div>
                      )}
                      <div>
                        <Link
                          to={`/products/${line.productId}`}
                          className="font-medium text-gray-900 dark:text-gray-100 hover:underline"
                        >
                          {line.productTitle}
                        </Link>
                        {line.variantTitle !== "Default Title" && (
                          <p className="text-[10px] text-muted-foreground">{line.variantTitle}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-mono">{line.sku ?? <span className="text-muted-foreground">no SKU</span>}</p>
                    {line.barcode && line.barcode !== line.sku && (
                      <p className="font-mono text-[10px] text-muted-foreground">{line.barcode}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">{line.warehouse.name}</td>
                  <td className="px-3 py-2.5 font-mono text-[10px]">
                    {line.defaultLocation ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${line.available < 0 ? "text-red-600" : line.available === 0 ? "text-orange-500" : "text-gray-900 dark:text-gray-100"}`}>
                    {line.available}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{line.reserved}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{line.qc}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{line.damaged}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{line.onHand}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setAdjusting(line)}>
                      Adjust
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {meta.page} of {meta.totalPages} · {meta.total} lines
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

      {adjusting && <AdjustStockDialog line={adjusting} onClose={() => setAdjusting(null)} />}
    </div>
  );
}

// ─────────────────────────── Adjust dialog ───────────────────────────

function AdjustStockDialog({ line, onClose }: { line: StockLine; onClose: () => void }) {
  const [bucket, setBucket] = useState<StockBucket>("AVAILABLE");
  const [mode, setMode] = useState<"add" | "remove" | "set">("add");
  const [qty, setQty] = useState<string>("");
  const [reason, setReason] = useState<string>("adjustment");
  const [note, setNote] = useState("");
  const adjust = useCreateAdjustmentMutation();

  const current = { AVAILABLE: line.available, RESERVED: line.reserved, QC: line.qc, DAMAGED: line.damaged }[bucket];
  const parsed = parseInt(qty, 10);
  const valid = Number.isInteger(parsed) && parsed >= 0 && (mode === "set" || parsed > 0);

  const submit = () => {
    if (!valid) return;
    adjust.mutate(
      {
        variantId: line.variantId,
        warehouseId: line.warehouse.id,
        bucket,
        ...(mode === "set"
          ? { setTo: parsed }
          : { delta: mode === "add" ? parsed : -parsed }),
        reason: reason as "adjustment",
        note: note || undefined,
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <ModalShell
      title="Adjust stock"
      subtitle={`${line.productTitle}${line.variantTitle !== "Default Title" ? ` — ${line.variantTitle}` : ""} · ${line.warehouse.name}`}
      onClose={onClose}
    >
      <div className="space-y-4 px-6 py-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">Bucket</span>
            <Select value={bucket} onValueChange={(v) => setBucket(v as StockBucket)}>
              <SelectTrigger className="h-8 w-full rounded-lg text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUCKETS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b.charAt(0) + b.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">Action</span>
            <Select value={mode} onValueChange={(v) => setMode(v as "add")}>
              <SelectTrigger className="h-8 w-full rounded-lg text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="add">Add units</SelectItem>
                <SelectItem value="remove">Remove units</SelectItem>
                <SelectItem value="set">Set exact value</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <label className="block space-y-1">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {mode === "set" ? "New quantity" : "Units"}
            <span className="ml-2 font-normal text-muted-foreground">
              current: {current}
            </span>
          </span>
          <Input
            type="number"
            min={0}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="h-8 text-xs"
            placeholder="0"
            autoFocus
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">Reason</span>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-8 w-full rounded-lg text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="adjustment">Adjustment</SelectItem>
                <SelectItem value="count">Stock count</SelectItem>
                <SelectItem value="damage">Damage</SelectItem>
                <SelectItem value="found">Found stock</SelectItem>
                <SelectItem value="correction">Correction</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">Note (optional)</span>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-8 text-xs"
              placeholder="e.g. cycle count Aug"
            />
          </label>
        </div>
        {mode === "remove" && parsed > current && bucket !== "AVAILABLE" && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-[11px] text-red-700">
            Removing more than the current {bucket.toLowerCase()} quantity will be rejected.
          </p>
        )}
      </div>
      <DialogFooter
        confirmLabel={mode === "set" ? `Set ${bucket.toLowerCase()} to ${valid ? parsed : "…"}` : mode === "add" ? "Add units" : "Remove units"}
        onConfirm={submit}
        onClose={onClose}
        pending={adjust.isPending}
        confirmDisabled={!valid}
      />
    </ModalShell>
  );
}
