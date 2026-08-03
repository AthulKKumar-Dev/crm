import { useState } from "react";
import {
  Search, Download, ChevronLeft, ChevronRight, Receipt, FileText,
  ArrowUpRight, ArrowDownRight, X, Loader2, Eye,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "~/components/ui/select";
import { toast } from "sonner";
import { EmptyState } from "~/components/app/empty-state";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { Skeleton } from "~/components/ui/skeleton";
import { cn, formatCurrency as fmtCurrency } from "~/lib/utils";
import { useInvoices, useInvoice, useGstReturn } from "~/hooks/use-invoice-queries";
import { useCancelInvoiceMutation } from "~/hooks/use-invoice-mutations";
import { invoiceService } from "~/services/invoice.service";
import { useGstins } from "~/hooks/use-gst-queries";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { useDebounced } from "~/hooks/use-debounced";
import type {
  InvoiceListParams,
  GstReturnParams,
  Invoice,
  InvoiceDetail,
  GstReturnGstr1,
  GstReturnGstr3B,
  OrganizationGstin,
} from "~/types/api";

export function meta() {
  return [
    { title: "Invoices | Collabo CRM" },
    { name: "description", content: "GST invoices and tax return summaries" },
  ];
}

const PAGE_SIZE = 15;

// ── Financial Year helper ───────────────────────────────────────────────────

function getCurrentFinancialYear(): string {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month >= 3) return `${year}-${(year + 1).toString().slice(2)}`;
  return `${year - 1}-${year.toString().slice(2)}`;
}

const MONTHS = [
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
];

/**
 * Hook-backed currency formatter: binds the active org's currency (synced from
 * Shopify on channel connect) so call sites stay one-arg. Falls back to "INR"
 * since this page is GST-specific.
 */
function useCurrencyFormatter() {
  const { data: org } = useCurrentOrg();
  const currency = org?.currency ?? "INR";
  return (amount: number) => fmtCurrency(amount, currency);
}

// ── Status badge ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ISSUED: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  DRAFT: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400",
  CANCELLED: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
  CREDIT_NOTE: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_STYLES[status] || "bg-gray-100 text-gray-600")}>
      {status.replace("_", " ")}
    </span>
  );
}

function GstTypeBadge({ type }: { type: string }) {
  const isIntra = type === "CGST_SGST";
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
      isIntra
        ? "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400"
        : "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400"
    )}>
      {isIntra ? "Intra" : "Inter"}
    </span>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const formatCurrency = useCurrencyFormatter();
  const [activeView, setActiveView] = useState<"invoices" | "gstr1" | "gstr3b">("invoices");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [financialYear] = useState(getCurrentFinancialYear);
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().getMonth() >= 3
      ? (new Date().getMonth() + 1).toString().padStart(2, "0")
      : (new Date().getMonth() + 1).toString().padStart(2, "0")
  );

  // Debounced into the query key only — the input keeps the raw value, so
  // typing stays instant without a request per keystroke.
  const debouncedSearch = useDebounced(searchQuery, 350);

  const params: InvoiceListParams = {
    page: currentPage,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    financialYear,
  };

  const { data: invoiceData, isLoading } = useInvoices(params);
  const invoices = invoiceData?.data ?? [];
  const meta = invoiceData?.meta;
  const totalPages = meta?.totalPages ?? 1;

  const returnParams: GstReturnParams | null =
    activeView !== "invoices"
      ? {
          financialYear,
          period: selectedMonth,
          returnType: activeView === "gstr1" ? "GSTR1" : "GSTR3B",
        }
      : null;
  const { data: returnData, isLoading: returnLoading } = useGstReturn(returnParams);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            GST invoices and tax return summaries for your business.
          </p>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1 w-fit">
        {[
          { id: "invoices" as const, label: "Invoices" },
          { id: "gstr1" as const, label: "GSTR-1" },
          { id: "gstr3b" as const, label: "GSTR-3B" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeView === tab.id
                ? "bg-white dark:bg-gray-900 shadow-sm text-gray-900 dark:text-gray-100"
                : "text-muted-foreground hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Invoices List View */}
      {activeView === "invoices" && (
        <>
          {/* Search bar */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search invoices..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="h-9 w-full rounded-lg border bg-white dark:bg-gray-900 pl-9 pr-3 text-xs outline-none focus:ring-1 focus:ring-[#cdff8c]"
            />
          </div>

          {/* Invoice table */}
          {isLoading ? (
            <TableSkeleton rows={8} columns={8} />
          ) : invoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No invoices yet"
              description="Generate GST invoices from your orders to see them here."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Invoice #</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Order</th>
                    <th className="px-4 py-3 font-medium">Buyer</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium text-right">CGST</th>
                    <th className="px-4 py-3 font-medium text-right">SGST</th>
                    <th className="px-4 py-3 font-medium text-right">IGST</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invoices.map((inv: Invoice) => (
                    <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-gray-900 dark:text-gray-100">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{inv.order.name}</td>
                      <td className="px-4 py-3">
                        <p className="text-gray-900 dark:text-gray-100">{inv.buyerName}</p>
                        {inv.buyerGstin && (
                          <p className="text-[10px] font-mono text-muted-foreground">{inv.buyerGstin}</p>
                        )}
                      </td>
                      <td className="px-4 py-3"><GstTypeBadge type={inv.gstType} /></td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(inv.totalCgst)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(inv.totalSgst)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(inv.totalIgst)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                        {formatCurrency(inv.grandTotal)}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedInvoiceId(inv.id)}
                          className="rounded-md p-1 text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                          title="View invoice"
                        >
                          <Eye className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <p className="text-[10px] text-muted-foreground">
                    Page {meta?.page} of {totalPages} ({meta?.total} invoices)
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="rounded-md p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                    >
                      <ChevronLeft className="size-3.5" />
                    </button>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="rounded-md p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                    >
                      <ChevronRight className="size-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* GSTR-1 View */}
      {activeView === "gstr1" && (
        <GstReturnView
          financialYear={financialYear}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          data={returnData as GstReturnGstr1 | undefined}
          isLoading={returnLoading}
          type="GSTR1"
        />
      )}

      {/* GSTR-3B View */}
      {activeView === "gstr3b" && (
        <GstReturnView
          financialYear={financialYear}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          data={returnData as GstReturnGstr3B | undefined}
          isLoading={returnLoading}
          type="GSTR3B"
        />
      )}

      {/* Invoice detail modal */}
      {selectedInvoiceId && (
        <InvoiceDetailModal
          invoiceId={selectedInvoiceId}
          onClose={() => setSelectedInvoiceId(null)}
        />
      )}
    </div>
  );
}

// ── Invoice Detail Modal ────────────────────────────────────────────────────

function InvoiceDetailModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const formatCurrency = useCurrencyFormatter();
  const { data: invoice, isLoading } = useInvoice(invoiceId);
  const cancelInvoice = useCancelInvoiceMutation();

  if (isLoading || !invoice) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="rounded-xl bg-white dark:bg-gray-900 p-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white dark:bg-gray-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
              Tax Invoice: {invoice.invoiceNumber}
            </h2>
            <p className="text-[10px] text-muted-foreground">
              {new Date(invoice.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
              {" "} | FY {invoice.financialYear}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={invoice.status} />
            <button onClick={onClose} className="rounded-md p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Seller / Buyer info */}
        <div className="grid grid-cols-2 gap-6 border-b px-6 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Seller</p>
            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{invoice.sellerLegalName}</p>
            <p className="text-[10px] font-mono text-muted-foreground">GSTIN: {invoice.sellerGstin}</p>
            <p className="text-[10px] text-muted-foreground">{invoice.sellerStateName} ({invoice.sellerStateCode})</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Buyer</p>
            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{invoice.buyerName}</p>
            {invoice.buyerGstin ? (
              <p className="text-[10px] font-mono text-muted-foreground">GSTIN: {invoice.buyerGstin}</p>
            ) : (
              <p className="text-[10px] text-muted-foreground italic">B2C (Unregistered)</p>
            )}
            <p className="text-[10px] text-muted-foreground">{invoice.buyerStateName} ({invoice.buyerStateCode})</p>
          </div>
        </div>

        {/* Place of Supply + GST Type */}
        <div className="flex items-center gap-4 border-b px-6 py-3 text-[10px]">
          <span className="text-muted-foreground">Place of Supply: <strong className="text-gray-900 dark:text-gray-100">{invoice.placeOfSupplyName} ({invoice.placeOfSupply})</strong></span>
          <GstTypeBadge type={invoice.gstType} />
          {invoice.reverseCharge && (
            <span className="rounded bg-orange-50 px-1.5 py-0.5 text-orange-700 font-medium">Reverse Charge</span>
          )}
        </div>

        {/* Line items */}
        <div className="px-6 py-4">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b text-left uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium">HSN</th>
                <th className="pb-2 font-medium text-right">Qty</th>
                <th className="pb-2 font-medium text-right">Rate</th>
                <th className="pb-2 font-medium text-right">Taxable</th>
                {invoice.gstType === "CGST_SGST" ? (
                  <>
                    <th className="pb-2 font-medium text-right">CGST</th>
                    <th className="pb-2 font-medium text-right">SGST</th>
                  </>
                ) : (
                  <th className="pb-2 font-medium text-right">IGST</th>
                )}
                <th className="pb-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoice.lineItems.map((item, idx) => (
                <tr key={item.id}>
                  <td className="py-2 text-muted-foreground">{idx + 1}</td>
                  <td className="py-2 text-gray-900 dark:text-gray-100">{item.description}</td>
                  <td className="py-2 font-mono text-muted-foreground">{item.hsnCode}</td>
                  <td className="py-2 text-right">{item.quantity}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(item.taxableValue)}</td>
                  {invoice.gstType === "CGST_SGST" ? (
                    <>
                      <td className="py-2 text-right tabular-nums">
                        <span className="text-muted-foreground">{item.cgstRate}%</span>{" "}
                        {formatCurrency(item.cgstAmount)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        <span className="text-muted-foreground">{item.sgstRate}%</span>{" "}
                        {formatCurrency(item.sgstAmount)}
                      </td>
                    </>
                  ) : (
                    <td className="py-2 text-right tabular-nums">
                      <span className="text-muted-foreground">{item.igstRate}%</span>{" "}
                      {formatCurrency(item.igstAmount)}
                    </td>
                  )}
                  <td className="py-2 text-right font-semibold tabular-nums">{formatCurrency(item.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t px-6 py-4">
          <div className="ml-auto max-w-xs space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatCurrency(invoice.subtotal)}</span></div>
            {invoice.gstType === "CGST_SGST" ? (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span className="tabular-nums">{formatCurrency(invoice.totalCgst)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span className="tabular-nums">{formatCurrency(invoice.totalSgst)}</span></div>
              </>
            ) : (
              <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span className="tabular-nums">{formatCurrency(invoice.totalIgst)}</span></div>
            )}
            <div className="flex justify-between border-t pt-1 font-semibold text-gray-900 dark:text-gray-100">
              <span>Grand Total</span>
              <span className="tabular-nums">{formatCurrency(invoice.grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        {invoice.status === "ISSUED" && (
          <div className="border-t px-6 py-4">
            <button
              onClick={() => cancelInvoice.mutate(invoiceId)}
              disabled={cancelInvoice.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              {cancelInvoice.isPending ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
              Cancel Invoice
            </button>
          </div>
        )}

        {invoice.notes && (
          <div className="border-t px-6 py-3">
            <p className="text-[10px] text-muted-foreground"><strong>Notes:</strong> {invoice.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── GST Return View ─────────────────────────────────────────────────────────

function GstReturnView({
  financialYear,
  selectedMonth,
  onMonthChange,
  data,
  isLoading,
  type,
}: {
  financialYear: string;
  selectedMonth: string;
  onMonthChange: (v: string) => void;
  data: GstReturnGstr1 | GstReturnGstr3B | undefined;
  isLoading: boolean;
  type: "GSTR1" | "GSTR3B";
}) {
  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
          FY {financialYear}
        </div>
        <Select value={selectedMonth} onValueChange={onMonthChange}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m) => (
              <SelectItem key={m.value} value={m.value} className="text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={async () => {
            try {
              const blob = await invoiceService.exportGstReturnCsv({
                financialYear, period: selectedMonth,
                returnType: type === "GSTR1" ? "GSTR1" : "GSTR3B",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${type}-${financialYear}-${selectedMonth}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            } catch { toast.error("Failed to download CSV."); }
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#b8e87a]"
        >
          <Download className="size-3.5" />
          Download CSV
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <EmptyState
          icon={FileText}
          title="No data available"
          description="Generate invoices to see GST return summaries."
        />
      ) : type === "GSTR1" ? (
        <Gstr1Tables data={data as GstReturnGstr1} />
      ) : (
        <Gstr3bTables data={data as GstReturnGstr3B} />
      )}
    </div>
  );
}

// ── GSTR-1 Tables ───────────────────────────────────────────────────────────

function Gstr1Tables({ data }: { data: GstReturnGstr1 }) {
  const formatCurrency = useCurrencyFormatter();
  return (
    <div className="space-y-6">
      {/* Totals summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Invoices", value: data.totals.totalInvoices },
          { label: "Taxable", value: formatCurrency(data.totals.totalTaxable) },
          { label: "CGST", value: formatCurrency(data.totals.totalCgst) },
          { label: "SGST", value: formatCurrency(data.totals.totalSgst) },
          { label: "IGST", value: formatCurrency(data.totals.totalIgst) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-border">
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-sm font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
          </div>
        ))}
      </div>

      {/* B2B Section */}
      {data.b2b.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
          <div className="border-b px-4 py-3">
            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">B2B Invoices (Registered Buyers)</p>
          </div>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b text-left uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Buyer GSTIN</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium text-right">Invoices</th>
                <th className="px-4 py-2 font-medium text-right">Taxable</th>
                <th className="px-4 py-2 font-medium text-right">Tax</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.b2b.map((entry) => (
                <tr key={entry.buyerGstin}>
                  <td className="px-4 py-2 font-mono">{entry.buyerGstin}</td>
                  <td className="px-4 py-2">{entry.buyerName}</td>
                  <td className="px-4 py-2 text-right">{entry.invoiceCount}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(entry.totalTaxable)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(entry.totalTax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* B2C Section */}
      {data.b2cSummary.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
          <div className="border-b px-4 py-3">
            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">B2C Summary (Unregistered Buyers)</p>
          </div>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b text-left uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Place of Supply</th>
                <th className="px-4 py-2 font-medium text-right">Invoices</th>
                <th className="px-4 py-2 font-medium text-right">Taxable</th>
                <th className="px-4 py-2 font-medium text-right">CGST</th>
                <th className="px-4 py-2 font-medium text-right">SGST</th>
                <th className="px-4 py-2 font-medium text-right">IGST</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.b2cSummary.map((entry) => (
                <tr key={entry.placeOfSupply}>
                  <td className="px-4 py-2">{entry.placeOfSupplyName} ({entry.placeOfSupply})</td>
                  <td className="px-4 py-2 text-right">{entry.invoiceCount}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(entry.totalTaxable)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(entry.totalCgst)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(entry.totalSgst)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(entry.totalIgst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* HSN Summary */}
      {data.hsnSummary.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
          <div className="border-b px-4 py-3">
            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">HSN-wise Summary</p>
          </div>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b text-left uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">HSN Code</th>
                <th className="px-4 py-2 font-medium text-right">Quantity</th>
                <th className="px-4 py-2 font-medium text-right">Taxable Value</th>
                <th className="px-4 py-2 font-medium text-right">Total Tax</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.hsnSummary.map((entry) => (
                <tr key={entry.hsnCode}>
                  <td className="px-4 py-2 font-mono">{entry.hsnCode}</td>
                  <td className="px-4 py-2 text-right">{entry.quantity}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(entry.taxable)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(entry.tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── GSTR-3B Tables ──────────────────────────────────────────────────────────

function Gstr3bTables({ data }: { data: GstReturnGstr3B }) {
  const formatCurrency = useCurrencyFormatter();
  return (
    <div className="space-y-6">
      {/* Tax Payable Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "CGST Payable", value: formatCurrency(data.taxPayable.cgst) },
          { label: "SGST Payable", value: formatCurrency(data.taxPayable.sgst) },
          { label: "IGST Payable", value: formatCurrency(data.taxPayable.igst) },
          { label: "Total Tax", value: formatCurrency(data.taxPayable.total) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-border">
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-sm font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Outward Supplies by Rate */}
      <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
        <div className="border-b px-4 py-3">
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">3.1 Outward Supplies by Rate</p>
        </div>
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b text-left uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 font-medium">GST Rate</th>
              <th className="px-4 py-2 font-medium text-right">Taxable Value</th>
              <th className="px-4 py-2 font-medium text-right">CGST</th>
              <th className="px-4 py-2 font-medium text-right">SGST</th>
              <th className="px-4 py-2 font-medium text-right">IGST</th>
              <th className="px-4 py-2 font-medium text-right">Total Tax</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.outwardSupplies.map((row) => (
              <tr key={row.gstRate}>
                <td className="px-4 py-2 font-semibold">{row.gstRate}%</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(row.taxableValue)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(row.cgst)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(row.sgst)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(row.igst)}</td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatCurrency(row.totalTax)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inter-State Summary */}
      <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border p-4">
        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2">3.2 Inter-State Supplies</p>
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <span>Invoices: <strong className="text-gray-900 dark:text-gray-100">{data.interState.invoiceCount}</strong></span>
          <span>Taxable: <strong className="text-gray-900 dark:text-gray-100">{formatCurrency(data.interState.totalTaxable)}</strong></span>
          <span>IGST: <strong className="text-gray-900 dark:text-gray-100">{formatCurrency(data.interState.totalIgst)}</strong></span>
        </div>
      </div>
    </div>
  );
}
