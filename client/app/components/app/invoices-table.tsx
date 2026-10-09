import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Copy,
  Eye,
  FileDown,
  Loader2,
  MoreHorizontal,
  Printer,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import { downloadInvoicePdf } from "~/lib/invoice-pdf";

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
  DropdownMenuSeparator,
  DropdownMenuShortcut,
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
import type { Invoice, InvoiceSortField } from "~/types/api";

interface InvoicesTableProps {
  invoices: ReadonlyArray<Invoice>;
  currency: string;
  onSelect: (id: string) => void;
  /** Opens the cancel confirmation — never cancels directly. */
  onCancel: (invoice: Invoice) => void;
  /** Cancelling is ORG_MANAGERS-only server-side — see `useInvoiceActionGates`. */
  canCancel: boolean;
  sortBy: InvoiceSortField;
  sortOrder: "asc" | "desc";
  onSortChange: (field: InvoiceSortField) => void;
}

function formatInvoiceDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * A column header that sorts.
 *
 * Sorting is server-side (`sortBy` / `sortOrder` on the list DTO, whitelisted
 * there to the columns below), so this only reports the intent upwards. It
 * deliberately does not reorder the page-sized slice it is holding — that would
 * be a sort silently confined to the current page.
 */
function SortableHead({
  field,
  label,
  sortBy,
  sortOrder,
  onSortChange,
  align = "left",
}: {
  field: InvoiceSortField;
  label: string;
  sortBy: InvoiceSortField;
  sortOrder: "asc" | "desc";
  onSortChange: (field: InvoiceSortField) => void;
  align?: "left" | "right";
}) {
  const active = sortBy === field;
  const Icon = !active ? ArrowUpDown : sortOrder === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead
      className={align === "right" ? "text-right" : undefined}
      aria-sort={
        active ? (sortOrder === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSortChange(field)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
          align === "right" && "flex-row-reverse",
          active && "text-foreground"
        )}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <Icon
          aria-hidden
          className={cn("size-3", active ? "opacity-100" : "opacity-40")}
        />
      </button>
    </TableHead>
  );
}

export function InvoicesTable({
  invoices,
  currency,
  onSelect,
  onCancel,
  canCancel,
  sortBy,
  sortOrder,
  onSortChange,
}: InvoicesTableProps) {
  const sortProps = { sortBy, sortOrder, onSortChange };

  // One build at a time per row: a second click while the PDF engine is still
  // loading would otherwise produce two downloads of the same file.
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  async function downloadPdf(id: string) {
    setDownloadingId(id);
    try {
      await downloadInvoicePdf(id);
    } finally {
      setDownloadingId(null);
    }
  }

  async function copyInvoiceNumber(invoiceNumber: string) {
    try {
      await navigator.clipboard.writeText(invoiceNumber);
      toast.success(`Copied ${invoiceNumber}`);
    } catch {
      // Clipboard access is denied outside secure contexts and under some
      // policies. Say so, rather than reporting a copy that did not happen.
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead field="invoiceNumber" label="Invoice" {...sortProps} />
            <SortableHead field="buyerName" label="Buyer" {...sortProps} />
            <SortableHead field="invoiceDate" label="Date" {...sortProps} />
            <TableHead>Order</TableHead>
            <SortableHead
              field="subtotal"
              label="Taxable"
              align="right"
              {...sortProps}
            />
            <SortableHead
              field="totalTax"
              label="Tax"
              align="right"
              {...sortProps}
            />
            <SortableHead
              field="grandTotal"
              label="Total"
              align="right"
              {...sortProps}
            />
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

                {/* Links through to the order the invoice was raised against.
                    Stops propagation so it doesn't also open the dialog. */}
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <Link
                    to={`/orders/${invoice.order.id}`}
                    className="text-caption text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {invoice.order.name}
                  </Link>
                </TableCell>

                <TableCell className="text-right text-caption tabular-nums text-foreground">
                  {formatCurrency(invoice.subtotal, invoice.currency || currency)}
                </TableCell>

                <TableCell className="text-right text-caption tabular-nums text-muted-foreground">
                  {formatCurrency(invoice.totalTax, invoice.currency || currency)}
                </TableCell>

                <TableCell className="text-right text-caption font-semibold tabular-nums text-foreground">
                  {formatCurrency(invoice.grandTotal, invoice.currency || currency)}
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
                    {/* One menu per row. The standalone download icon used to
                        open the print page — a promise the row did not keep —
                        so every action now lives here, grouped: view and
                        navigate, then documents, then the destructive one. */}
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
                      {/* Wide enough that "Copy invoice no." and the order
                          suffix never wrap — a two-line menu item reads as
                          two items. */}
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => onSelect(invoice.id)}>
                          <Eye />
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={`/orders/${invoice.order.id}`}>
                            <ShoppingBag />
                            Open order
                            <DropdownMenuShortcut>{invoice.order.name}</DropdownMenuShortcut>
                          </Link>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          disabled={downloadingId === invoice.id}
                          onSelect={() => downloadPdf(invoice.id)}
                        >
                          {downloadingId === invoice.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <FileDown />
                          )}
                          Download PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          {/* New tab, matching how order detail opens this same
                              route — printing shouldn't lose the list you were on. */}
                          <Link
                            to={`/orders/invoices/${invoice.id}/print`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Printer />
                            Print
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => copyInvoiceNumber(invoice.invoiceNumber)}
                        >
                          <Copy />
                          Copy invoice no.
                        </DropdownMenuItem>

                        {/* Cancelling is ORG_MANAGERS-only server-side; without
                            the role check this item could only ever 403. */}
                        {canCancel && invoice.status === "ISSUED" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => onCancel(invoice)}
                            >
                              <Ban />
                              Cancel invoice
                            </DropdownMenuItem>
                          </>
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
