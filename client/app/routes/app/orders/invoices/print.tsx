import { useEffect, useRef } from "react";
import { useParams } from "react-router";
import { useInvoice } from "~/hooks/use-invoice-queries";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { readAddress } from "~/lib/address";
import { formatCurrency } from "~/lib/utils";

export function meta() {
  return [{ title: "Bill | Collabo CRM" }];
}

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const { data: invoice, isLoading, isError, refetch } = useInvoice(id);
  const { data: org } = useCurrentOrg();
  const currency = invoice?.currency ?? org?.currency ?? "INR";
  const isCancelled = invoice?.status === "CANCELLED";

  // Print once per invoice, not once per response.
  //
  // This depended on the whole `invoice` object. Structural sharing means an
  // unchanged refetch reuses the reference, so it looked fine — but any refetch
  // that returned different data threw a second OS print dialog at someone
  // mid-review. That is reachable: `refetchOnReconnect` is left at its default
  // of true, and four separate call sites invalidate `invoiceKeys.all`, which
  // prefix-matches this query. Depending on the id fixes the common case; the
  // ref makes a same-id remount safe too.
  //
  // Cancelled invoices are excluded: auto-printing one puts a void document in
  // someone's hand with no deliberate action. The button below still works if
  // a printed copy is genuinely wanted — it carries the banner.
  const printedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!invoice?.id || isCancelled || printedRef.current === invoice.id) return;
    printedRef.current = invoice.id;
    // Small delay so layout settles before the dialog opens.
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, [invoice?.id, isCancelled]);

  // Error must be checked before the loading branch. `isError` leaves
  // `isLoading` false and `invoice` undefined, so a 404 or a network failure
  // fell into the loading branch and showed "Loading bill…" forever.
  if (isError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium text-foreground">
          Couldn't load this invoice.
        </p>
        <p className="text-xs text-muted-foreground">
          It may have been removed, or the request failed on the way.
        </p>
        <button
          onClick={() => refetch()}
          className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800"
        >
          Try again
        </button>
      </div>
    );
  }

  if (isLoading || !invoice) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading bill…
      </div>
    );
  }

  const isIntra = invoice.gstType === "CGST_SGST";
  // Money fields arrive as Prisma Decimals, i.e. strings. Coerce before any
  // comparison — "0.00" is truthy and would render an empty discount row.
  const num = (value: number | string | null | undefined) => Number(value ?? 0);
  const discount = num(invoice.totalDiscount);
  const shipping = num(invoice.shippingCharge);
  // Pre-discount value of the goods. Shown so the "less discount" line has
  // something to be subtracted from — `subtotal` is already net of it.
  const grossValue = num(invoice.subtotal) + discount;

  const sellerAddress = readAddress(
    invoice.sellerAddress as Record<string, unknown> | null,
  );
  const buyerAddress = readAddress(
    invoice.buyerAddress as Record<string, unknown> | null,
  );

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="mx-auto max-w-3xl bg-white p-8 text-[12px] text-gray-900">
        {/* A cancelled invoice used to print byte-identical to a live one. */}
        {isCancelled && (
          <div className="mb-4 rounded-md border-2 border-red-600 px-4 py-2 text-center">
            <p className="text-base font-bold uppercase tracking-widest text-red-600">
              Cancelled
            </p>
            <p className="text-[11px] text-red-700">
              This invoice was cancelled
              {invoice.cancelledAt
                ? ` on ${new Date(invoice.cancelledAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}`
                : ""}{" "}
              and carries no tax liability.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <h1 className="text-xl font-bold">Tax Invoice</h1>
            <p className="text-[11px] text-gray-600">
              GST-compliant invoice
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{invoice.invoiceNumber}</p>
            <p className="text-[11px] text-gray-600">
              {new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
            <p className="text-[11px] text-gray-600">
              FY {invoice.financialYear}
            </p>
          </div>
        </div>

        {/* Seller / Buyer. Address is a statutory field on both sides — it was
            missing entirely because nothing ever captured the seller's. */}
        <div className="mt-4 grid grid-cols-2 gap-6">
          <Block title="Seller">
            <p className="font-semibold">{invoice.sellerLegalName}</p>
            {sellerAddress.lines.map((line) => (
              <p key={line} className="text-[11px]">
                {line}
              </p>
            ))}
            <p className="text-[11px]">
              {invoice.sellerStateCode} — {invoice.sellerStateName}
            </p>
            <p className="text-[11px]">GSTIN: {invoice.sellerGstin}</p>
          </Block>
          <Block title="Buyer">
            <p className="font-semibold">{invoice.buyerName}</p>
            {buyerAddress.lines.map((line) => (
              <p key={line} className="text-[11px]">
                {line}
              </p>
            ))}
            <p className="text-[11px]">
              {invoice.buyerStateCode} — {invoice.buyerStateName}
            </p>
            {invoice.buyerGstin ? (
              <p className="text-[11px]">GSTIN: {invoice.buyerGstin}</p>
            ) : (
              <p className="text-[11px] italic text-gray-600">
                Unregistered (B2C)
              </p>
            )}
          </Block>
        </div>

        {/* Place of supply */}
        <div className="mt-3 rounded-md border bg-gray-50 px-3 py-2 text-[11px]">
          <span className="text-gray-600">Place of supply: </span>
          <span className="font-medium">
            {invoice.placeOfSupply} — {invoice.placeOfSupplyName}
          </span>
          <span className="ml-3 text-gray-600">Type: </span>
          <span className="font-medium">
            {isIntra ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"}
          </span>
        </div>

        {/* Line items */}
        <table className="mt-4 w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="px-2 py-1.5 font-medium">Description</th>
              <th className="px-2 py-1.5 font-medium">HSN</th>
              <th className="px-2 py-1.5 text-right font-medium">Qty</th>
              <th className="px-2 py-1.5 text-right font-medium">Unit</th>
              <th className="px-2 py-1.5 text-right font-medium">Disc.</th>
              <th className="px-2 py-1.5 text-right font-medium">Taxable</th>
              {isIntra ? (
                <>
                  <th className="px-2 py-1.5 text-right font-medium">CGST</th>
                  <th className="px-2 py-1.5 text-right font-medium">SGST</th>
                </>
              ) : (
                <th className="px-2 py-1.5 text-right font-medium">IGST</th>
              )}
              <th className="px-2 py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((li) => (
              <tr key={li.id} className="border-b last:border-b-0">
                <td className="px-2 py-1.5">{li.description}</td>
                <td className="px-2 py-1.5">{li.hsnCode}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {li.quantity}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {formatCurrency(li.unitPrice, currency)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {num(li.discount) > 0
                    ? `−${formatCurrency(li.discount, currency)}`
                    : "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {formatCurrency(li.taxableValue, currency)}
                </td>
                {isIntra ? (
                  <>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatCurrency(li.cgstAmount, currency)} ({li.cgstRate}%)
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatCurrency(li.sgstAmount, currency)} ({li.sgstRate}%)
                    </td>
                  </>
                ) : (
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatCurrency(li.igstAmount, currency)} ({li.igstRate}%)
                  </td>
                )}
                <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                  {formatCurrency(li.totalAmount, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/*
          Totals, as a ladder that actually reconciles to the grand total.

          It previously printed: Subtotal, CGST, SGST, *Total tax* (a fourth row
          double-listing the two above it), then "Discount" as a MINUS — but the
          discount is already inside the subtotal, so it was being shown as a
          deduction that had not been taken. Shipping, a real addend of
          grandTotal, was missing entirely. Three separate reasons the printed
          figures did not add up.

          Now: gross → less discount → taxable → tax → shipping → grand total.
        */}
        <div className="mt-4 ml-auto w-80 space-y-1 text-[11px]">
          {discount > 0 && (
            <>
              <Row
                label="Gross value"
                value={formatCurrency(grossValue, currency)}
              />
              <Row
                label="Less: discount"
                value={`−${formatCurrency(invoice.totalDiscount, currency)}`}
              />
            </>
          )}
          <Row
            label="Taxable value"
            value={formatCurrency(invoice.subtotal, currency)}
          />
          {isIntra ? (
            <>
              <Row
                label="CGST"
                value={formatCurrency(invoice.totalCgst, currency)}
              />
              <Row
                label="SGST"
                value={formatCurrency(invoice.totalSgst, currency)}
              />
            </>
          ) : (
            <Row
              label="IGST"
              value={formatCurrency(invoice.totalIgst, currency)}
            />
          )}
          {shipping > 0 && (
            <Row
              label="Shipping (not taxed)"
              value={formatCurrency(invoice.shippingCharge, currency)}
            />
          )}
          <div className="border-t pt-1">
            <Row
              label="Grand total"
              value={formatCurrency(invoice.grandTotal, currency)}
              bold
            />
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-4 border-t pt-3 text-[11px] text-gray-700">
            <span className="font-medium">Notes: </span>
            {invoice.notes}
          </div>
        )}

        <div className="no-print mt-6 flex justify-end">
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>
    </>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">
        {title}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${
        bold ? "font-semibold text-gray-900" : "text-gray-700"
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
