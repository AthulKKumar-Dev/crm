import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Search, Download, Plus, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { toast } from "sonner";

import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderActions,
} from "~/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { SectionCard } from "~/components/app/section-card";
import { StatCard } from "~/components/app/stat-card";
import { SegmentedTabs } from "~/components/app/segmented-tabs";
import { InvoicesTable } from "~/components/app/invoices-table";
import { InvoiceDetailDialog } from "~/components/app/invoice-detail-dialog";
import {
  Gstr1B2bPanel,
  Gstr1B2cPanel,
  Gstr1HsnPanel,
} from "~/components/app/gstr1-panels";
import {
  Gstr3bOutwardPanel,
  Gstr3bInterStatePanel,
} from "~/components/app/gstr3b-panels";
import {
  GstFilingSidebar,
  type ReturnType,
} from "~/components/app/gst-filing-sidebar";
import { EmptyState } from "~/components/app/empty-state";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { QueryErrorState } from "~/components/app/query-error-state";
import { useInvoices, useInvoiceStats, useGstReturn } from "~/hooks/use-invoice-queries";
import { useCancelInvoiceMutation } from "~/hooks/use-invoice-mutations";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { useDebounced } from "~/hooks/use-debounced";
import { invoiceService } from "~/services/invoice.service";
import { formatCurrency } from "~/lib/utils";
import {
  MONTHS,
  b2bSectionTotals,
  daysUntil,
  formatPeriodLabel,
  getCurrentFinancialYear,
  getCurrentPeriod,
  outwardSupplyTotals,
  returnDueDate,
} from "~/lib/gst-return";
import type {
  GstReturnGstr1,
  GstReturnGstr3B,
  InvoiceListParams,
  InvoiceStats,
} from "~/types/api";

export function meta() {
  return [
    { title: "Invoices | Collabo CRM" },
    { name: "description", content: "GST invoices and tax return summaries" },
  ];
}

const PAGE_SIZE = 15;

type Tab = "invoices" | "filing";
type Chip = "all" | "unpaid" | "b2b" | "drafts" | "cancelled";

/** Chip → the list filter it applies. `all` deliberately carries none. */
const CHIP_FILTERS: Record<Chip, Partial<InvoiceListParams>> = {
  all: {},
  unpaid: { paymentState: "UNPAID" },
  b2b: { buyerType: "B2B" },
  drafts: { status: "DRAFT" },
  cancelled: { status: "CANCELLED" },
};

/** "1 – 24 Aug 2026" — the window the month-to-date figures cover. */
function formatStatsWindow(stats: InvoiceStats): string {
  const start = new Date(stats.periodStart);
  const end = new Date(stats.periodEnd);
  const endLabel = end.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${start.getDate()} – ${endLabel}`;
}

export default function InvoicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab, return type and period live in the URL because the design links
  // across them — the due banner jumps to the filing view and the sidebar
  // crosses between GSTR-1 and GSTR-3B. Local state cannot express those as
  // real links, and this makes a period shareable for free.
  const tab = (searchParams.get("tab") as Tab) ?? "invoices";
  const returnType = (searchParams.get("return") as ReturnType) ?? "GSTR1";
  const period = searchParams.get("period") ?? getCurrentPeriod();
  const [financialYear] = useState(getCurrentFinancialYear);

  const [chip, setChip] = useState<Chip>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const { data: org } = useCurrentOrg();
  const currency = org?.currency ?? "INR";

  function patchParams(patch: Record<string, string>) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) next.set(key, value);
        return next;
      },
      { replace: true },
    );
  }

  // Debounced into the query key only — the input keeps the raw value, so
  // typing stays instant without a request per keystroke.
  const debouncedSearch = useDebounced(searchQuery, 350);

  const listParams: InvoiceListParams = {
    page: currentPage,
    limit: PAGE_SIZE,
    financialYear,
    search: debouncedSearch || undefined,
    ...CHIP_FILTERS[chip],
  };

  const {
    data: invoiceData,
    isLoading,
    isError,
    refetch,
  } = useInvoices(listParams);
  const { data: stats, isLoading: statsLoading } = useInvoiceStats({ financialYear });
  const cancelInvoice = useCancelInvoiceMutation();

  const invoices = invoiceData?.data ?? [];
  const meta = invoiceData?.meta;
  const totalPages = meta?.totalPages ?? 1;

  const { data: returnData, isLoading: returnLoading } = useGstReturn(
    tab === "filing" ? { financialYear, period, returnType } : null,
  );

  const periodLabel = formatPeriodLabel(financialYear, period) ?? period;
  const gstr1DueDate = returnDueDate(financialYear, period, "GSTR1");
  const gstr1DaysLeft = gstr1DueDate ? daysUntil(gstr1DueDate) : null;

  function handleChip(next: Chip) {
    setChip(next);
    setCurrentPage(1);
  }

  function handleSearch(event: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(event.target.value);
    setCurrentPage(1);
  }

  async function download(
    fetcher: () => Promise<Blob>,
    filename: string,
  ) {
    setIsDownloading(true);
    try {
      const blob = await fetcher();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not download the file. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Invoices</PageHeaderTitle>
          <PageHeaderDescription>
            GST invoices and tax return summaries for your business.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button
            variant="outline"
            className="h-auto rounded-full px-4.5 py-2"
            disabled={isDownloading}
            onClick={() =>
              download(
                () => invoiceService.exportCsv(listParams),
                `invoices-${financialYear}.csv`,
              )
            }
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>
          {/* Invoices are raised against an order, so this goes to the order
              list rather than to a standalone create form — there isn't one. */}
          <Button variant="brand" className="h-auto rounded-full px-4.5 py-2" asChild>
            <Link to="/orders" title="Pick an order to raise an invoice against">
              <Plus className="size-3.5" />
              New invoice
            </Link>
          </Button>
        </PageHeaderActions>
      </PageHeader>

      {/* View switch */}
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedTabs
          items={[
            { value: "invoices", label: "Invoices" },
            { value: "filing", label: "GST filing" },
          ]}
          value={tab}
          onChange={(next) => patchParams({ tab: next })}
          ariaLabel="Invoice views"
          idPrefix="view"
        />
        <span className="text-caption text-muted-foreground">FY {financialYear}</span>
      </div>

      {tab === "invoices" ? (
        <div
          role="tabpanel"
          id="view-panel-invoices"
          aria-labelledby="view-tab-invoices"
          className="space-y-6"
        >
          {/* KPI row */}
          <div className="grid grid-cols-1 gap-5 rounded-xl bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
            {statsLoading || !stats ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="p-5">
                  <Skeleton className="mb-4 h-3 w-24" />
                  <Skeleton className="h-7 w-20" />
                </div>
              ))
            ) : (
              [
                {
                  key: "invoiced",
                  label: "Invoiced this month",
                  value: formatCurrency(stats.invoicedThisMonth.amount, currency, {
                    maximumFractionDigits: 0,
                  }),
                  change: stats.invoicedThisMonth.changePct ?? undefined,
                  changeLabel: formatStatsWindow(stats),
                },
                {
                  key: "tax",
                  label: "Tax collected",
                  value: formatCurrency(stats.taxCollected.amount, currency, {
                    maximumFractionDigits: 0,
                  }),
                  change: stats.taxCollected.changePct ?? undefined,
                  changeLabel: "CGST + SGST + IGST",
                },
                {
                  key: "outstanding",
                  label: "Outstanding",
                  value: formatCurrency(stats.outstanding.amount, currency, {
                    maximumFractionDigits: 0,
                  }),
                  changeLabel: `${stats.outstanding.invoiceCount} invoices unpaid`,
                },
                {
                  key: "issued",
                  label: "Issued",
                  value: stats.counts.issued.toLocaleString("en-IN"),
                  changeLabel: `of ${stats.counts.all} · ${stats.counts.draft} drafts`,
                },
              ].map((card, index, all) => (
                <div key={card.key} className="flex items-center gap-4">
                  <StatCard
                    variant="inline"
                    label={card.label}
                    value={card.value}
                    change={card.change}
                    changeLabel={card.changeLabel}
                    className="flex-1"
                  />
                  {index < all.length - 1 && (
                    <Separator orientation="vertical" className="hidden h-15 md:block" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Filing reminder */}
          {gstr1DueDate && gstr1DaysLeft !== null && gstr1DaysLeft >= 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand px-5 py-3">
              <p className="flex items-center gap-2 text-caption text-brand-foreground">
                <Clock className="size-4 shrink-0" />
                <span>
                  <strong className="font-semibold">
                    GSTR-1 for {periodLabel} is due in {gstr1DaysLeft}{" "}
                    {gstr1DaysLeft === 1 ? "day" : "days"}.
                  </strong>{" "}
                  {stats
                    ? `${stats.counts.issued} issued invoices in FY ${financialYear}.`
                    : null}
                </span>
              </p>
              <Button
                variant="brand"
                size="sm"
                onClick={() => patchParams({ tab: "filing", return: "GSTR1" })}
              >
                Review filing
              </Button>
            </div>
          )}

          {/* Filters */}
          <SegmentedTabs
            items={[
              { value: "all", label: "All", count: stats?.counts.all },
              { value: "unpaid", label: "Unpaid", count: stats?.counts.unpaid },
              { value: "b2b", label: "B2B", count: stats?.counts.b2b },
              { value: "drafts", label: "Drafts", count: stats?.counts.draft },
              {
                value: "cancelled",
                label: "Cancelled",
                count: stats?.counts.cancelled,
              },
            ]}
            value={chip}
            onChange={handleChip}
            ariaLabel="Filter invoices"
            behaviour="filter"
          />

          <SectionCard
            title="All invoices"
            description="Every GST invoice raised against an order this financial year."
            action={
              <div className="relative min-w-50 max-w-xs flex-1">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Invoice #, buyer or GSTIN…"
                  value={searchQuery}
                  onChange={handleSearch}
                  className="h-8 w-full rounded-lg border border-input bg-transparent pl-8 pr-3 text-caption placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                />
              </div>
            }
          >
            {/* Error MUST precede loading and empty: a failed request leaves
                isLoading false and data undefined, so the empty branch was
                reached and the user was told no invoices existed. `!invoiceData`
                keeps a failed background refetch from blanking a live table. */}
            {isError && !invoiceData ? (
              <div className="p-8">
                <QueryErrorState resource="invoices" onRetry={() => refetch()} />
              </div>
            ) : isLoading ? (
              <div className="p-4">
                <TableSkeleton rows={PAGE_SIZE} columns={9} />
              </div>
            ) : invoices.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title="No invoices found"
                  description={
                    searchQuery || chip !== "all"
                      ? "Try adjusting your search or filters."
                      : "Generate a GST invoice from an order to see it here."
                  }
                />
              </div>
            ) : (
              <InvoicesTable
                invoices={invoices}
                currency={currency}
                onSelect={setSelectedInvoiceId}
                onCancel={(id) => cancelInvoice.mutate(id)}
              />
            )}

            {!isLoading && invoices.length > 0 && (
              <div className="flex items-center justify-between border-t px-5 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="size-3.5" />
                  Previous
                </Button>
                <p className="text-caption text-muted-foreground">
                  Page {meta?.page ?? 1} of {totalPages} ({meta?.total ?? 0} total)
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                  disabled={currentPage >= totalPages}
                >
                  Next
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            )}
          </SectionCard>
        </div>
      ) : (
        <div
          role="tabpanel"
          id="view-panel-filing"
          aria-labelledby="view-tab-filing"
          className="space-y-6"
        >
          {/* Return switch and period */}
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedTabs
              items={[
                { value: "GSTR1", label: "GSTR-1" },
                { value: "GSTR3B", label: "GSTR-3B" },
              ]}
              value={returnType}
              onChange={(next) => patchParams({ return: next })}
              ariaLabel="GST return type"
              idPrefix="return"
            />
            <span className="text-caption text-muted-foreground">
              {returnType === "GSTR1"
                ? "Outward supplies · invoice-wise"
                : "Summary return · tax payable"}
            </span>
            <Select value={period} onValueChange={(next) => patchParams({ period: next })}>
              <SelectTrigger className="h-8 w-35 text-caption">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((month) => (
                  <SelectItem
                    key={month.value}
                    value={month.value}
                    className="text-caption"
                  >
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {returnLoading ? (
                <>
                  <Skeleton className="h-24 w-full rounded-xl" />
                  <Skeleton className="h-64 w-full rounded-xl" />
                </>
              ) : !returnData ? (
                <div className="rounded-xl bg-card p-8 shadow-sm ring-1 ring-border">
                  <EmptyState
                    title="No return data"
                    description={`No issued invoices for ${periodLabel}.`}
                  />
                </div>
              ) : returnType === "GSTR1" ? (
                <Gstr1View
                  data={returnData as GstReturnGstr1}
                  currency={currency}
                />
              ) : (
                <Gstr3bView
                  data={returnData as GstReturnGstr3B}
                  currency={currency}
                />
              )}
            </div>

            <GstFilingSidebar
              financialYear={financialYear}
              period={period}
              returnType={returnType}
              periodLabel={periodLabel}
              facts={
                returnData
                  ? returnType === "GSTR1"
                    ? gstr1Facts(returnData as GstReturnGstr1, currency)
                    : gstr3bFacts(returnData as GstReturnGstr3B, currency)
                  : []
              }
              onSwitchReturn={(next) => patchParams({ return: next })}
              isDownloading={isDownloading}
              onDownloadCsv={() =>
                download(
                  () =>
                    invoiceService.exportGstReturnCsv({
                      financialYear,
                      period,
                      returnType,
                    }),
                  `${returnType}-${financialYear}-${period}.csv`,
                )
              }
            />
          </div>
        </div>
      )}

      <InvoiceDetailDialog
        invoiceId={selectedInvoiceId}
        currency={currency}
        onClose={() => setSelectedInvoiceId(null)}
      />
    </div>
  );
}

// ── Return views ────────────────────────────────────────────────────────────

/** Compact KPI strip above the return tables. */
function ReturnStats({
  cards,
}: {
  cards: ReadonlyArray<{
    key: string;
    label: string;
    value: string;
    inverted?: boolean;
  }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <StatCard
          key={card.key}
          label={card.label}
          value={card.value}
          tone={card.inverted ? "inverted" : "default"}
          className="rounded-xl"
        />
      ))}
    </div>
  );
}

function Gstr1View({
  data,
  currency,
}: {
  data: GstReturnGstr1;
  currency: string;
}) {
  const money = (amount: number) =>
    formatCurrency(amount, currency, { maximumFractionDigits: 0 });

  return (
    <>
      <ReturnStats
        cards={[
          {
            key: "invoices",
            label: "Invoices",
            value: data.totals.totalInvoices.toLocaleString("en-IN"),
          },
          {
            key: "taxable",
            label: "Taxable value",
            value: money(data.totals.totalTaxable),
          },
          {
            key: "cgst-sgst",
            label: "CGST + SGST",
            value: money(data.totals.totalCgst + data.totals.totalSgst),
          },
          { key: "igst", label: "IGST", value: money(data.totals.totalIgst) },
        ]}
      />
      <Gstr1B2bPanel data={data} currency={currency} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Gstr1B2cPanel data={data} currency={currency} />
        <Gstr1HsnPanel data={data} currency={currency} />
      </div>
    </>
  );
}

function Gstr3bView({
  data,
  currency,
}: {
  data: GstReturnGstr3B;
  currency: string;
}) {
  const money = (amount: number) =>
    formatCurrency(amount, currency, { maximumFractionDigits: 0 });
  const totals = outwardSupplyTotals(data.outwardSupplies);

  return (
    <>
      <ReturnStats
        cards={[
          {
            key: "outward",
            label: "Outward taxable value",
            value: money(totals.taxableValue),
          },
          { key: "igst", label: "IGST", value: money(data.taxPayable.igst) },
          {
            key: "cgst-sgst",
            label: "CGST + SGST",
            value: money(data.taxPayable.cgst + data.taxPayable.sgst),
          },
          {
            key: "payable",
            label: "Tax payable",
            value: money(data.taxPayable.total),
            // With no ITC ledger in the system, tax payable *is* the net
            // payable in cash — nothing can be set off against it.
            inverted: true,
          },
        ]}
      />
      <Gstr3bOutwardPanel data={data} currency={currency} />
      <Gstr3bInterStatePanel data={data} currency={currency} />
    </>
  );
}

// ── Sidebar facts ───────────────────────────────────────────────────────────

function gstr1Facts(data: GstReturnGstr1, currency: string) {
  const b2b = b2bSectionTotals(data.b2b);
  const b2cInvoices = data.b2cSummary.reduce(
    (sum, entry) => sum + entry.invoiceCount,
    0,
  );

  return [
    { label: "Invoices in period", value: String(data.totals.totalInvoices) },
    { label: "B2B / B2C", value: `${b2b.invoiceCount} / ${b2cInvoices}` },
    {
      label: "Total tax",
      value: formatCurrency(data.totals.totalTax, currency, {
        maximumFractionDigits: 0,
      }),
    },
  ];
}

function gstr3bFacts(data: GstReturnGstr3B, currency: string) {
  const totals = outwardSupplyTotals(data.outwardSupplies);

  return [
    {
      label: "Taxable value",
      value: formatCurrency(totals.taxableValue, currency, {
        maximumFractionDigits: 0,
      }),
    },
    { label: "Rate slabs", value: String(data.outwardSupplies.length) },
    {
      label: "Tax payable",
      value: formatCurrency(data.taxPayable.total, currency, {
        maximumFractionDigits: 0,
      }),
    },
  ];
}
