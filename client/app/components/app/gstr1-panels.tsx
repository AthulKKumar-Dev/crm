import { useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { SectionCard } from "~/components/app/section-card";
import { EmptyState } from "~/components/app/empty-state";
import { formatCurrency } from "~/lib/utils";
import { b2bSectionTotals } from "~/lib/gst-return";
import type { GstReturnGstr1 } from "~/types/api";

/** Rows shown before the "show all" toggle appears. */
const COLLAPSED_ROWS = 4;

interface PanelProps {
  data: GstReturnGstr1;
  currency: string;
}

/** Right-aligned section total, rendered in the card header. */
function SectionTotal({ amount, currency }: { amount: number; currency: string }) {
  return (
    <span className="text-body font-semibold tabular-nums text-foreground">
      {formatCurrency(amount, currency, { maximumFractionDigits: 0 })}
    </span>
  );
}

function ShowAllButton({
  expanded,
  hiddenCount,
  noun,
  onToggle,
}: {
  expanded: boolean;
  hiddenCount: number;
  noun: string;
  onToggle: () => void;
}) {
  if (hiddenCount <= 0) return null;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full border-t px-5 py-3 text-left text-caption font-medium text-brand-strong transition-colors hover:text-brand-strong-hover"
    >
      {expanded ? "Show fewer" : `Show all ${hiddenCount + COLLAPSED_ROWS} ${noun}`}
    </button>
  );
}

/** 4A — invoice-wise outward supplies to registered buyers, grouped by GSTIN. */
export function Gstr1B2bPanel({ data, currency }: PanelProps) {
  const [expanded, setExpanded] = useState(false);
  const totals = b2bSectionTotals(data.b2b);
  const rows = expanded ? data.b2b : data.b2b.slice(0, COLLAPSED_ROWS);

  return (
    <SectionCard
      title="4A · B2B invoices"
      description={`Registered buyers · ${totals.invoiceCount} invoices`}
      action={<SectionTotal amount={totals.totalTaxable} currency={currency} />}
    >
      {data.b2b.length === 0 ? (
        <div className="p-8">
          <EmptyState
            title="No B2B invoices"
            description="Invoices to buyers with a GSTIN will appear here."
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Buyer GSTIN</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => (
                  <TableRow key={entry.buyerGstin} className="hover:bg-transparent">
                    <TableCell className="font-mono text-caption text-muted-foreground">
                      {entry.buyerGstin}
                    </TableCell>
                    <TableCell className="text-caption font-medium text-foreground">
                      {entry.buyerName}
                    </TableCell>
                    <TableCell className="text-right text-caption tabular-nums text-muted-foreground">
                      {entry.invoiceCount}
                    </TableCell>
                    <TableCell className="text-right text-caption tabular-nums text-foreground">
                      {formatCurrency(entry.totalTaxable, currency, {
                        maximumFractionDigits: 0,
                      })}
                    </TableCell>
                    <TableCell className="text-right text-caption font-medium tabular-nums text-foreground">
                      {formatCurrency(entry.totalTax, currency, {
                        maximumFractionDigits: 0,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ShowAllButton
            expanded={expanded}
            hiddenCount={data.b2b.length - COLLAPSED_ROWS}
            noun="buyers"
            onToggle={() => setExpanded((previous) => !previous)}
          />
        </>
      )}
    </SectionCard>
  );
}

/** 7 — consolidated B2C supplies, grouped by place of supply. */
export function Gstr1B2cPanel({ data, currency }: PanelProps) {
  return (
    <SectionCard title="7 · B2C summary" description="By place of supply">
      {data.b2cSummary.length === 0 ? (
        <div className="p-8">
          <EmptyState
            title="No B2C invoices"
            description="Invoices to unregistered buyers will appear here."
          />
        </div>
      ) : (
        <ul className="divide-y">
          {data.b2cSummary.map((entry) => (
            <li
              key={entry.placeOfSupply}
              className="flex items-center justify-between gap-4 px-5 py-3"
            >
              <span className="truncate text-caption font-medium text-foreground">
                {entry.placeOfSupplyName} ({entry.placeOfSupply})
              </span>
              <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                {entry.invoiceCount}
              </span>
              <span className="shrink-0 text-caption font-medium tabular-nums text-foreground">
                {formatCurrency(entry.totalTaxable, currency, {
                  maximumFractionDigits: 0,
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** 12 — HSN-wise summary of quantity and tax. */
export function Gstr1HsnPanel({ data, currency }: PanelProps) {
  return (
    <SectionCard title="12 · HSN summary" description="Quantity and tax by code">
      {data.hsnSummary.length === 0 ? (
        <div className="p-8">
          <EmptyState
            title="No HSN data"
            description="HSN codes are taken from the invoice line items in this period."
          />
        </div>
      ) : (
        <ul className="divide-y">
          {data.hsnSummary.map((entry) => (
            <li
              key={entry.hsnCode}
              className="flex items-center justify-between gap-4 px-5 py-3"
            >
              <span className="font-mono text-caption text-foreground">
                {entry.hsnCode}
              </span>
              <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                {entry.quantity.toLocaleString("en-IN")}
              </span>
              <span className="shrink-0 text-caption font-medium tabular-nums text-foreground">
                {formatCurrency(entry.tax, currency, { maximumFractionDigits: 0 })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
