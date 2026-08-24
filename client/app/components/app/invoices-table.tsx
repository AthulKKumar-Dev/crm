import { Link } from "react-router";
import { Download, MoreHorizontal, Ban, Eye } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "~/components/ui/dropdown-menu";
import { cn, formatCurrency } from "~/lib/utils";
import {
  GST_TYPE_LABELS,
  INVOICE_STATUS_CLASSES,
  INVOICE_STATUS_DOTS,
  INVOICE_STATUS_LABELS,
  effectiveGstRate,
  resolveDisplayStatus,
} from "~/lib/invoice-status";
import type { Invoice } from "~/types/api";

interface InvoicesTableProps {
  invoices: ReadonlyArray<Invoice>;
  currency: string;
  onSelect: (id: string) => void;
  onCancel: (id: string) => void;
}

function formatInvoiceDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function InvoicesTable({
  invoices,
  currency,
  onSelect,
  onCancel,
}: InvoicesTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Invoice</TableHead>
            <TableHead>Buyer</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Order</TableHead>
            <TableHead className="text-right">Taxable</TableHead>
            <TableHead className="text-right">Tax</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
            {/* Actions — deliberately unlabelled, per the other tables. */}
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => {
            const displayStatus = resolveDisplayStatus(invoice);
            const rate = effectiveGstRate(invoice);
            const gstLabel = GST_TYPE_LABELS[invoice.gstType];

            return (
              <TableRow
                key={invoice.id}
                className="cursor-pointer"
                onClick={() => onSelect(invoice.id)}
              >
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        INVOICE_STATUS_DOTS[displayStatus]
                      )}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-mono text-caption font-semibold text-foreground">
                        {invoice.invoiceNumber}
                      </p>
                      <p className="truncate text-micro text-muted-foreground">
                        {gstLabel}
                        {rate !== null && ` · ${rate}%`}
                      </p>
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  <p className="truncate text-caption font-medium text-foreground">
                    {invoice.buyerName}
                  </p>
                  {invoice.buyerGstin ? (
                    <p className="truncate font-mono text-micro text-muted-foreground">
                      {invoice.buyerGstin}
                    </p>
                  ) : (
                    <p className="truncate text-micro text-muted-foreground">
                      B2C · unregistered
                    </p>
                  )}
                </TableCell>

                <TableCell className="whitespace-nowrap text-caption text-muted-foreground">
                  {formatInvoiceDate(invoice.invoiceDate)}
                </TableCell>

                <TableCell className="text-caption text-muted-foreground">
                  {invoice.order.name}
                </TableCell>

                <TableCell className="text-right text-caption tabular-nums text-foreground">
                  {formatCurrency(invoice.subtotal, currency)}
                </TableCell>

                <TableCell className="text-right text-caption tabular-nums text-muted-foreground">
                  {formatCurrency(invoice.totalTax, currency)}
                </TableCell>

                <TableCell className="text-right text-caption font-semibold tabular-nums text-foreground">
                  {formatCurrency(invoice.grandTotal, currency)}
                </TableCell>

                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-micro font-medium",
                      INVOICE_STATUS_CLASSES[displayStatus]
                    )}
                  >
                    {INVOICE_STATUS_LABELS[displayStatus]}
                  </span>
                </TableCell>

                {/* Row click opens the dialog, so the action cell stops
                    propagation rather than nesting interactive elements. */}
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <div className="flex items-center justify-end gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      asChild
                      title="Download invoice"
                    >
                      <Link
                        to={`/orders/invoices/${invoice.id}/print`}
                        aria-label={`Download invoice ${invoice.invoiceNumber}`}
                      >
                        <Download />
                      </Link>
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for invoice ${invoice.invoiceNumber}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onSelect(invoice.id)}>
                          <Eye />
                          View details
                        </DropdownMenuItem>
                        {invoice.status === "ISSUED" && (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => onCancel(invoice.id)}
                          >
                            <Ban />
                            Cancel invoice
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
