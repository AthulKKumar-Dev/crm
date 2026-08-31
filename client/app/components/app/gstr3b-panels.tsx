import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { SectionCard } from "~/components/app/section-card";
import { EmptyState } from "~/components/app/empty-state";
import { formatCurrency } from "~/lib/utils";
import { outwardSupplyTotals } from "~/lib/gst-return";
import type { GstReturnGstr3B } from "~/types/api";

interface PanelProps {
  data: GstReturnGstr3B;
  currency: string;
}

/**
 * Zero renders as an em dash, matching the statutory forms — a column of
 * "₹0" reads as a filed figure, whereas a dash reads as "nothing under this
 * head", which is what a zero here actually means.
 */
function Amount({ value, currency }: { value: number; currency: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <>{formatCurrency(value, currency, { maximumFractionDigits: 0 })}</>;
}

/**
 * 3.1 — outward supplies, broken down by GST rate.
 *
 * The statutory form splits this into rows (a)–(e) by supply nature (taxable,
 * zero-rated, nil/exempt, reverse-charge inward, non-GST). Nothing in the
 * schema classifies a line that way, so every invoice here is row (a) and the
 * other four would be permanently empty. Showing the rate breakdown instead
 * keeps the table informative without implying classifications the data does
 * not carry.
 */
export function Gstr3bOutwardPanel({ data, currency }: PanelProps) {
  const totals = outwardSupplyTotals(data.outwardSupplies);

  return (
    <SectionCard
      title="3.1 · Outward taxable supplies"
      description="By GST rate — supply-nature classification is not tracked"
    >
      {data.outwardSupplies.length === 0 ? (
        <div className="p-8">
          <EmptyState
            title="No outward supplies"
            description="Issued invoices in this period will appear here."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>GST rate</TableHead>
                <TableHead className="text-right">Taxable value</TableHead>
                <TableHead className="text-right">IGST</TableHead>
                <TableHead className="text-right">CGST</TableHead>
                <TableHead className="text-right">SGST</TableHead>
                <TableHead className="text-right">Total tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.outwardSupplies.map((row) => (
                <TableRow key={row.gstRate} className="hover:bg-transparent">
                  <TableCell className="text-caption font-medium text-foreground">
                    {row.gstRate}%
                  </TableCell>
                  <TableCell className="text-right text-caption tabular-nums text-foreground">
                    <Amount value={row.taxableValue} currency={currency} />
                  </TableCell>
                  <TableCell className="text-right text-caption tabular-nums text-foreground">
                    <Amount value={row.igst} currency={currency} />
                  </TableCell>
                  <TableCell className="text-right text-caption tabular-nums text-foreground">
                    <Amount value={row.cgst} currency={currency} />
                  </TableCell>
                  <TableCell className="text-right text-caption tabular-nums text-foreground">
                    <Amount value={row.sgst} currency={currency} />
                  </TableCell>
                  <TableCell className="text-right text-caption font-medium tabular-nums text-foreground">
                    <Amount value={row.totalTax} currency={currency} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="text-caption font-semibold text-foreground">
                  Total
                </TableCell>
                <TableCell className="text-right text-caption font-semibold tabular-nums text-foreground">
                  <Amount value={totals.taxableValue} currency={currency} />
                </TableCell>
                <TableCell className="text-right text-caption font-semibold tabular-nums text-foreground">
                  <Amount value={totals.igst} currency={currency} />
                </TableCell>
                <TableCell className="text-right text-caption font-semibold tabular-nums text-foreground">
                  <Amount value={totals.cgst} currency={currency} />
                </TableCell>
                <TableCell className="text-right text-caption font-semibold tabular-nums text-foreground">
                  <Amount value={totals.sgst} currency={currency} />
                </TableCell>
                <TableCell className="text-right text-caption font-semibold tabular-nums text-foreground">
                  <Amount value={totals.totalTax} currency={currency} />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </SectionCard>
  );
}

/** 3.2 — inter-state supplies to unregistered persons, by place of supply. */
export function Gstr3bInterStatePanel({ data, currency }: PanelProps) {
  const rows = data.interState.byState;

  return (
    <SectionCard
      title="3.2 · Inter-state supplies to unregistered persons"
      description="By place of supply"
    >
      {rows.length === 0 ? (
        <div className="p-8">
          <EmptyState
            title="No inter-state B2C supplies"
            description="IGST invoices to buyers without a GSTIN will appear here."
          />
        </div>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li
              key={row.placeOfSupply}
              className="flex items-center justify-between gap-4 px-5 py-3"
            >
              <span className="truncate text-caption font-medium text-foreground">
                {row.placeOfSupplyName} ({row.placeOfSupply})
              </span>
              <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                {formatCurrency(row.totalTaxable, currency, {
                  maximumFractionDigits: 0,
                })}
              </span>
              <span className="shrink-0 text-caption font-medium tabular-nums text-foreground">
                {formatCurrency(row.totalIgst, currency, {
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
