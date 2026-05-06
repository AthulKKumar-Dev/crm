import { useState } from "react";
import { Link } from "react-router";
import {
  Search, Download, Upload, ChevronLeft, ChevronRight, ShoppingBag, Package,
  Target, Box, X, Loader2, Receipt, MapPin, Check, Plus,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { StatCard } from "~/components/app/stat-card";
import { OrdersTable } from "~/components/app/orders-table";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { EmptyState } from "~/components/app/empty-state";
import { Skeleton } from "~/components/ui/skeleton";
import { cn, formatCurrency } from "~/lib/utils";
import { useOrders, useOrderStats, useOrder } from "~/hooks/use-order-queries";
import { useGstins, useIndianStates } from "~/hooks/use-gst-queries";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { useCreateInvoiceMutation } from "~/hooks/use-invoice-mutations";
import { invoiceService } from "~/services/invoice.service";
import { toast } from "sonner";
import type { OrderListParams, DashboardQueryParams, OrderDetail, OrganizationGstin } from "~/types/api";

export function meta() {
  return [
    { title: "Orders | Collabo CRM" },
    { name: "description", content: "Manage and track all your orders" },
  ];
}

const PAGE_SIZE = 9;

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

const DATE_RANGE_MAP: Record<string, number | null> = { all: null, "7d": 7, "30d": 30, "90d": 90 };

export default function OrdersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [dateRange, setDateRange] = useState("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [invoiceOrderId, setInvoiceOrderId] = useState<string | null>(null);

  const { data: org } = useCurrentOrg();
  const gstEnabled = org?.gstEnabled ?? false;
  const orgCurrency = org?.currency ?? "USD";

  const daysBack = DATE_RANGE_MAP[dateRange];
  const dateFrom = daysBack != null ? daysAgo(daysBack) : undefined;

  const params: OrderListParams = {
    page: currentPage,
    limit: PAGE_SIZE,
    search: searchQuery || undefined,
    dateFrom,
  };

  const statsParams: DashboardQueryParams | undefined = dateFrom ? { dateFrom } : undefined;

  const { data, isLoading } = useOrders(params);
  const { data: stats, isLoading: statsLoading } = useOrderStats(statsParams);
  const orders = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  function handleSearchChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(event.target.value);
    setCurrentPage(1);
  }

  function handleDateRangeChange(value: string) {
    setDateRange(value);
    setCurrentPage(1);
  }

  function formatChange(direction: "up" | "down" | "same", percentage: number) {
    return direction === "down" ? -percentage : percentage;
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Orders</h1>
          <p className="text-sm text-muted-foreground">
            An overview of recent data of customers info, products details and analysis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/orders/new"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 px-3 text-xs font-medium text-white dark:text-gray-900 shadow-sm hover:bg-gray-800 dark:hover:bg-white"
          >
            <Plus className="size-3.5" />
            Create Order
          </Link>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-white dark:bg-gray-900 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800/60">
            <Upload className="size-3.5" />
            Export CSV
          </button>
          <button
            onClick={async () => {
              try {
                const blob = await invoiceService.exportCsv({
                  dateFrom,
                  dateTo: new Date().toISOString().split("T")[0],
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `gst-invoices-${dateRange}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              } catch { toast.error("Failed to download report."); }
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#CEF17B] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#BADE6F]"
          >
            <Download className="size-3.5" />
            Download Report
          </button>
          <Select value={dateRange} onValueChange={handleDateRangeChange}>
            <SelectTrigger className="h-8 w-[120px] rounded-lg border border-input bg-white dark:bg-gray-900 dark:border-gray-700 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
              <Skeleton className="h-3 w-24 mb-4" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))
        ) : stats ? (
          <>
            <StatCard
              label="Total New Orders"
              value={stats.totalNewOrders.current.toLocaleString()}
              change={formatChange(stats.totalNewOrders.change.direction, stats.totalNewOrders.change.percentage)}
              changeLabel="vs previous period"
              icon={<ShoppingBag className="size-4" />}
            />
            <StatCard
              label="Pending Orders"
              value={stats.pendingOrders.current.toLocaleString()}
              change={formatChange(stats.pendingOrders.change.direction, stats.pendingOrders.change.percentage)}
              changeLabel="vs previous period"
              icon={<Package className="size-4" />}
            />
            <StatCard
              label="Total Sales"
              value={formatCurrency(Number(stats.totalSales.current), orgCurrency)}
              change={formatChange(stats.totalSales.change.direction, stats.totalSales.change.percentage)}
              changeLabel="vs previous period"
              icon={<Target className="size-4" />}
            />
            <StatCard
              label="Products Sold"
              value={Number(stats.totalProductsSold.current).toLocaleString()}
              change={formatChange(stats.totalProductsSold.change.direction, stats.totalProductsSold.change.percentage)}
              changeLabel="vs previous period"
              icon={<Box className="size-4" />}
            />
          </>
        ) : (
          <>
            <StatCard label="Total New Orders" value="—" change={0} icon={<ShoppingBag className="size-4" />} />
            <StatCard label="Pending Orders" value="—" change={0} icon={<Package className="size-4" />} />
            <StatCard label="Total Sales" value="—" change={0} icon={<Target className="size-4" />} />
            <StatCard label="Products Sold" value="—" change={0} icon={<Box className="size-4" />} />
          </>
        )}
      </div>

      {/* Orders table with search and pagination */}
      <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
        {/* Table header with search */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">All Orders</p>
            <p className="text-xs text-muted-foreground">Keep track of recent order data and others information.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search here..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="h-8 w-48 rounded-lg border border-input bg-transparent pl-8 pr-10 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#CEF17B]/50"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Table body */}
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={PAGE_SIZE} columns={7} />
          </div>
        ) : orders.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No orders found"
              description={searchQuery ? "Try adjusting your search." : "Orders will appear here once synced from your channels."}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <OrdersTable
              orders={orders}
              currency={orgCurrency}
              showCustomerName
              gstEnabled={gstEnabled}
              onViewDetail={(id) => setSelectedOrderId(id)}
              onGenerateInvoice={(id) => setInvoiceOrderId(id)}
            />
          </div>
        )}

        {/* Pagination controls */}
        {!isLoading && orders.length > 0 && (
          <div className="flex items-center justify-between border-t px-5 py-3">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="inline-flex items-center gap-1 rounded-lg border border-input bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800/60 disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" />
              Previous
            </button>
            <p className="text-xs text-muted-foreground">
              Page {meta?.page ?? 1} of {totalPages} ({meta?.total ?? 0} total)
            </p>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-input bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800/60 disabled:pointer-events-none disabled:opacity-40"
            >
              Next
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Order Detail Drawer */}
      {selectedOrderId && (
        <OrderDetailDrawer
          orderId={selectedOrderId}
          gstEnabled={gstEnabled}
          currency={orgCurrency}
          onClose={() => setSelectedOrderId(null)}
          onGenerateInvoice={(id) => { setSelectedOrderId(null); setInvoiceOrderId(id); }}
        />
      )}

      {/* Generate Invoice Dialog */}
      {invoiceOrderId && (
        <GenerateInvoiceDialog
          orderId={invoiceOrderId}
          currency={orgCurrency}
          onClose={() => setInvoiceOrderId(null)}
        />
      )}
    </div>
  );
}

// ── Order Detail Drawer ─────────────────────────────────────────────────────

function OrderDetailDrawer({
  orderId,
  gstEnabled,
  currency,
  onClose,
  onGenerateInvoice,
}: {
  orderId: string;
  gstEnabled: boolean;
  currency: string;
  onClose: () => void;
  onGenerateInvoice: (id: string) => void;
}) {
  const { data: order, isLoading } = useOrder(orderId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-white dark:bg-gray-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading || !order ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Order {order.name}</h2>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
                </p>
              </div>
              <button onClick={onClose} className="rounded-md p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="size-4" />
              </button>
            </div>

            {/* Status badges */}
            <div className="flex items-center gap-2 px-6 py-3 border-b">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium",
                order.financialStatus === "PAID" ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-600"
              )}>
                {order.financialStatus}
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium",
                order.fulfillmentStatus === "FULFILLED" ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-600"
              )}>
                {order.fulfillmentStatus}
              </span>
            </div>

            {/* Customer */}
            <div className="border-b px-6 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Customer</p>
              <p className="text-xs font-medium text-gray-900 dark:text-gray-100">
                {order.customer?.firstName} {order.customer?.lastName}
              </p>
              <p className="text-[10px] text-muted-foreground">{order.customer?.email}</p>
            </div>

            {/* Line Items */}
            <div className="px-6 py-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Items</p>
              <div className="space-y-2">
                {order.lineItems?.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
                      {item.variantTitle && (
                        <p className="text-[10px] text-muted-foreground">{item.variantTitle}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-xs font-semibold tabular-nums">
                      {formatCurrency(Number(item.price) * item.quantity, currency)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="border-t px-6 py-4">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(order.subtotalPrice, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="tabular-nums">{formatCurrency(order.totalTax, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="tabular-nums">{formatCurrency(order.totalShippingPrice, currency)}</span>
                </div>
                {Number(order.totalDiscounts) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Discounts</span>
                    <span className="tabular-nums text-red-600">-{formatCurrency(order.totalDiscounts, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 font-semibold text-gray-900 dark:text-gray-100">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(order.totalPrice, currency)}</span>
                </div>
              </div>
            </div>

            {/* GST Invoice Button */}
            {gstEnabled && (
              <div className="border-t px-6 py-4">
                <button
                  onClick={() => onGenerateInvoice(orderId)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#cdff8c] px-4 py-2.5 text-xs font-semibold text-gray-900 hover:bg-[#b8e67d] transition-colors"
                >
                  <Receipt className="size-4" />
                  Generate GST Invoice
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Generate Invoice Dialog ─────────────────────────────────────────────────

function GenerateInvoiceDialog({ orderId, currency, onClose }: { orderId: string; currency: string; onClose: () => void }) {
  const { data: order, isLoading: orderLoading } = useOrder(orderId);
  const { data: gstins = [] } = useGstins();
  const { data: states = [] } = useIndianStates();
  const createInvoice = useCreateInvoiceMutation();

  const [sellerGstinId, setSellerGstinId] = useState("");
  const [buyerGstin, setBuyerGstin] = useState("");
  const [placeOfSupplyCode, setPlaceOfSupplyCode] = useState("");

  // Auto-fill buyer GSTIN from customer when order loads
  const activeGstins = gstins.filter((g: OrganizationGstin) => g.isActive);

  function handleGenerate() {
    createInvoice.mutate(
      {
        orderId,
        sellerGstinId: sellerGstinId || undefined,
        buyerGstin: buyerGstin || undefined,
        placeOfSupplyCode: placeOfSupplyCode || undefined,
      },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Generate GST Invoice</h2>
            <p className="text-[10px] text-muted-foreground">
              {order ? `Order ${order.name}` : "Loading..."}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="size-4" />
          </button>
        </div>

        {orderLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 px-6 py-4">
            {/* Seller GSTIN */}
            <div>
              <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
                Seller GSTIN {activeGstins.length === 0 && "(No GSTINs registered)"}
              </label>
              <Select value={sellerGstinId} onValueChange={setSellerGstinId}>
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue placeholder="Auto-select based on place of supply" />
                </SelectTrigger>
                <SelectContent>
                  {activeGstins.map((g: OrganizationGstin) => (
                    <SelectItem key={g.id} value={g.id} className="text-xs">
                      {g.gstin} — {g.stateName} {g.isDefault ? "(Default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Buyer GSTIN */}
            <div>
              <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
                Buyer GSTIN (optional — leave empty for B2C)
              </label>
              <input
                value={buyerGstin}
                onChange={(e) => setBuyerGstin(e.target.value.toUpperCase())}
                placeholder="e.g. 29AABCT1332L1ZN"
                maxLength={15}
                className="mt-1 w-full rounded-lg border bg-white dark:bg-gray-800 px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-[#cdff8c]"
              />
            </div>

            {/* Place of Supply */}
            <div>
              <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
                Place of Supply (auto-derived from order address if empty)
              </label>
              <Select value={placeOfSupplyCode} onValueChange={setPlaceOfSupplyCode}>
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue placeholder="Auto-detect from shipping address" />
                </SelectTrigger>
                <SelectContent>
                  {states.map((s) => (
                    <SelectItem key={s.code} value={s.code} className="text-xs">
                      {s.code} - {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Order summary */}
            {order && (
              <div className="rounded-lg border bg-gray-50 dark:bg-gray-800 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Order Summary</p>
                <div className="text-xs space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Items</span>
                    <span>{order.itemCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">{formatCurrency(order.subtotalPrice, currency)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-gray-900 dark:text-gray-100">
                    <span>Total</span>
                    <span className="tabular-nums">{formatCurrency(order.totalPrice, currency)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 border-t px-6 py-4">
          <button
            onClick={handleGenerate}
            disabled={createInvoice.isPending || activeGstins.length === 0}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#cdff8c] px-4 py-2 text-xs font-semibold text-gray-900 hover:bg-[#b8e67d] disabled:opacity-50 transition-colors"
          >
            {createInvoice.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            Generate Invoice
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
