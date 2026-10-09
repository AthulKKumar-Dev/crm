import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { readAddress } from "~/lib/address";
import type { InvoiceDetail } from "~/types/api";

/** Render the invoice to a PDF blob. The only entry point `invoice-pdf.ts` uses. */
export function renderInvoicePdfBlob(invoice: InvoiceDetail): Promise<Blob> {
  return pdf(<InvoicePdfDocument invoice={invoice} />).toBlob();
}

/**
 * The invoice as a PDF document. Imported lazily by `downloadInvoicePdf`;
 * nothing else should import this module, or the PDF engine lands in the
 * main bundle.
 *
 * Mirrors `components/app/invoice-document.tsx` section for section. Amounts
 * print as `INR 1,118.00`: the built-in PDF fonts carry no rupee glyph, and
 * the project ships no static TTF to register. Bundling one is a five-line
 * change in this file when it is wanted.
 */
export function InvoicePdfDocument({ invoice }: { invoice: InvoiceDetail }) {
  const currency = invoice.currency ?? "INR";
  // Plain figures in the table and the ladder; the currency is declared once
  // on the document. "INR 6,499.82 (9%)" in a 7%-wide cell overflowed into
  // its neighbours — a figure with no prefix fits every column at 8pt.
  const money = (value: number | string | null | undefined) =>
    new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value ?? 0));
  const num = (value: number | string | null | undefined) => Number(value ?? 0);
  const date = (value: string) =>
    new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  const isIntra = invoice.gstType === "CGST_SGST";
  const isCancelled = invoice.status === "CANCELLED";
  const discount = num(invoice.totalDiscount);
  const shipping = num(invoice.shippingCharge);
  // Pre-discount value of the goods, so "less discount" has something to be
  // subtracted from — `subtotal` is already net of it.
  const grossValue = num(invoice.subtotal) + discount;

  const seller = readAddress(invoice.sellerAddress as Record<string, unknown> | null);
  const buyer = readAddress(invoice.buyerAddress as Record<string, unknown> | null);
  const dispatch = readAddress(invoice.dispatchAddress as Record<string, unknown> | null);
  // Shown only when the goods left from somewhere other than the registered
  // address, matching the on-screen document.
  const showDispatch =
    !!invoice.dispatchName &&
    dispatch.lines.length > 0 &&
    dispatch.lines.join("|") !== seller.lines.join("|");

  // Column widths sum to 100. Sized for an 8pt figure up to 1,00,00,000.00
  // (≈46pt) inside the content width of 515pt, with the two intra-state tax
  // columns together taking what the single IGST column takes.
  const col = isIntra
    ? { desc: 29, hsn: 7, qty: 5, unit: 11, disc: 8, taxable: 12, tax: 8, total: 12 }
    : { desc: 33, hsn: 7, qty: 5, unit: 12, disc: 8, taxable: 12, tax: 11, total: 12 };

  /** A tax cell: the amount, then the rate on its own smaller line. */
  const taxCell = (amount: number | string, rate: number | string, width: number) => (
    <View style={[s.cell, { width: `${width}%` }]}>
      <Text style={s.right}>{money(amount)}</Text>
      <Text style={[s.right, s.rate]}>{rate}%</Text>
    </View>
  );

  return (
    <Document title={invoice.invoiceNumber} author={invoice.sellerLegalName}>
      <Page size="A4" style={s.page}>
        {isCancelled && (
          <View style={s.cancelled}>
            <Text style={s.cancelledTitle}>CANCELLED</Text>
            <Text style={s.cancelledText}>
              This invoice was cancelled
              {invoice.cancelledAt ? ` on ${date(invoice.cancelledAt)}` : ""} and
              carries no tax liability.
            </Text>
          </View>
        )}

        <View style={s.header}>
          <View>
            <Text style={s.h1}>Tax Invoice</Text>
            <Text style={s.muted}>GST-compliant invoice</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.bold}>{invoice.invoiceNumber}</Text>
            <Text style={s.muted}>{date(invoice.invoiceDate)}</Text>
            <Text style={s.muted}>FY {invoice.financialYear}</Text>
          </View>
        </View>

        <View style={s.parties}>
          <View style={s.party}>
            <Text style={s.label}>SELLER</Text>
            <Text style={s.bold}>{invoice.sellerLegalName}</Text>
            {seller.lines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
            <Text>
              {invoice.sellerStateCode} - {invoice.sellerStateName}
            </Text>
            <Text>GSTIN: {invoice.sellerGstin}</Text>
          </View>
          <View style={s.party}>
            <Text style={s.label}>BUYER</Text>
            <Text style={s.bold}>{invoice.buyerName}</Text>
            {buyer.lines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
            <Text>
              {invoice.buyerStateCode} - {invoice.buyerStateName}
            </Text>
            {invoice.buyerGstin ? (
              <Text>GSTIN: {invoice.buyerGstin}</Text>
            ) : (
              <Text style={s.mutedItalic}>Unregistered (B2C)</Text>
            )}
          </View>
        </View>

        {showDispatch && (
          <View style={{ marginTop: 10 }}>
            <Text style={s.label}>DISPATCH FROM</Text>
            <Text style={s.bold}>{invoice.dispatchName}</Text>
            {dispatch.lines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </View>
        )}

        <View style={s.supply}>
          <Text>
            <Text style={s.muted}>Place of supply: </Text>
            {invoice.placeOfSupply} - {invoice.placeOfSupplyName}
            <Text style={s.muted}>    Type: </Text>
            {isIntra ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"}
            <Text style={s.muted}>    Reverse charge: </Text>
            {invoice.reverseCharge ? "Yes" : "No"}
            <Text style={s.muted}>    Amounts in </Text>
            {currency}
          </Text>
        </View>

        <View style={s.table}>
          {/* `fixed` repeats the header on every page of a long invoice. */}
          <View style={[s.row, s.head]} fixed>
            <Text style={[s.cell, { width: `${col.desc}%` }]}>Description</Text>
            <Text style={[s.cell, { width: `${col.hsn}%` }]}>HSN</Text>
            <Text style={[s.cell, s.right, { width: `${col.qty}%` }]}>Qty</Text>
            <Text style={[s.cell, s.right, { width: `${col.unit}%` }]}>Unit</Text>
            <Text style={[s.cell, s.right, { width: `${col.disc}%` }]}>Disc.</Text>
            <Text style={[s.cell, s.right, { width: `${col.taxable}%` }]}>Taxable</Text>
            {isIntra ? (
              <>
                <Text style={[s.cell, s.right, { width: `${col.tax}%` }]}>CGST</Text>
                <Text style={[s.cell, s.right, { width: `${col.tax}%` }]}>SGST</Text>
              </>
            ) : (
              <Text style={[s.cell, s.right, { width: `${col.tax}%` }]}>IGST</Text>
            )}
            <Text style={[s.cell, s.right, { width: `${col.total}%` }]}>Total</Text>
          </View>

          {invoice.lineItems.map((li) => (
            // `wrap={false}`: a line never splits across a page break.
            <View key={li.id} style={s.row} wrap={false}>
              <Text style={[s.cell, { width: `${col.desc}%` }]}>{li.description}</Text>
              <Text style={[s.cell, { width: `${col.hsn}%` }]}>{li.hsnCode ?? ""}</Text>
              <Text style={[s.cell, s.right, { width: `${col.qty}%` }]}>{li.quantity}</Text>
              <Text style={[s.cell, s.right, { width: `${col.unit}%` }]}>
                {money(li.unitPrice)}
              </Text>
              <Text style={[s.cell, s.right, { width: `${col.disc}%` }]}>
                {num(li.discount) > 0 ? `-${money(li.discount)}` : "-"}
              </Text>
              <Text style={[s.cell, s.right, { width: `${col.taxable}%` }]}>
                {money(li.taxableValue)}
              </Text>
              {isIntra ? (
                <>
                  {taxCell(li.cgstAmount, li.cgstRate, col.tax)}
                  {taxCell(li.sgstAmount, li.sgstRate, col.tax)}
                </>
              ) : (
                taxCell(li.igstAmount, li.igstRate, col.tax)
              )}
              <Text style={[s.cell, s.right, s.bold, { width: `${col.total}%` }]}>
                {money(li.totalAmount)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals ladder: gross → less discount → taxable → tax → shipping →
            grand total. Same rows, same order, as the on-screen document. */}
        <View style={s.totals} wrap={false}>
          {discount > 0 && (
            <>
              <TotalRow label="Gross value" value={money(grossValue)} />
              <TotalRow label="Less: discount" value={`-${money(invoice.totalDiscount)}`} />
            </>
          )}
          <TotalRow label="Taxable value" value={money(invoice.subtotal)} />
          {isIntra ? (
            <>
              <TotalRow label="CGST" value={money(invoice.totalCgst)} />
              <TotalRow label="SGST" value={money(invoice.totalSgst)} />
            </>
          ) : (
            <TotalRow label="IGST" value={money(invoice.totalIgst)} />
          )}
          {shipping > 0 && (
            <TotalRow label="Shipping (not taxed)" value={money(invoice.shippingCharge)} />
          )}
          <View style={s.grand}>
            <TotalRow label="Grand total" value={money(invoice.grandTotal)} bold />
          </View>
        </View>

        {invoice.notes && (
          <View style={s.notes}>
            <Text>
              <Text style={s.bold}>Notes: </Text>
              {invoice.notes}
            </Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

function TotalRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={s.totalRow}>
      <Text style={bold ? s.bold : undefined}>{label}</Text>
      <Text style={bold ? s.bold : undefined}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    paddingVertical: 45,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#111827",
  },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#4b5563" },
  mutedItalic: { color: "#4b5563", fontFamily: "Helvetica-Oblique" },
  label: { fontSize: 7, color: "#6b7280", letterSpacing: 1, marginBottom: 3 },
  cancelled: {
    borderWidth: 2,
    borderColor: "#dc2626",
    padding: 8,
    marginBottom: 12,
    alignItems: "center",
  },
  cancelledTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#dc2626",
    letterSpacing: 2,
  },
  cancelledText: { fontSize: 8, color: "#b91c1c", marginTop: 2 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 10,
  },
  parties: { flexDirection: "row", gap: 24, marginTop: 14 },
  party: { flex: 1 },
  supply: {
    marginTop: 10,
    padding: 6,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 3,
  },
  table: { marginTop: 14, borderTopWidth: 1, borderTopColor: "#e5e7eb", fontSize: 8 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  head: { backgroundColor: "#f9fafb", fontFamily: "Helvetica-Bold" },
  cell: { paddingVertical: 4, paddingHorizontal: 3 },
  right: { textAlign: "right" },
  rate: { fontSize: 7, color: "#6b7280" },
  totals: { marginTop: 14, marginLeft: "auto", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { borderTopWidth: 1, borderTopColor: "#e5e7eb", marginTop: 3, paddingTop: 3 },
  notes: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
    color: "#374151",
  },
});
