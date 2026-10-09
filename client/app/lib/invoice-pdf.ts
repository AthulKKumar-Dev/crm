import { toast } from "sonner";
import { downloadBlob } from "~/lib/download-blob";
import { invoiceService } from "~/services/invoice.service";
import type { InvoiceDetail } from "~/types/api";

/**
 * Save an invoice as a PDF file.
 *
 * Built in the browser from the same detail payload the page and the print
 * route render, so the three can never disagree. The PDF engine is ~1 MB and
 * is loaded only here, on click — nothing else in the app pays for it.
 *
 * Accepts an id (list rows carry no line items) or a loaded detail (page,
 * print route) so callers that already have the data make no second request.
 */
export async function downloadInvoicePdf(
  invoiceOrId: InvoiceDetail | string,
): Promise<void> {
  let invoice: InvoiceDetail;
  try {
    invoice =
      typeof invoiceOrId === "string"
        ? await invoiceService.get(invoiceOrId)
        : invoiceOrId;
  } catch {
    toast.error("Couldn't load the invoice.");
    return;
  }

  await downloadBlob(
    async () => {
      // The lazy module owns the engine import, so this file stays in the
      // main bundle and the engine does not.
      const { renderInvoicePdfBlob } = await import(
        "~/components/app/invoice-pdf-document"
      );
      return renderInvoicePdfBlob(invoice);
    },
    invoicePdfFilename(invoice.invoiceNumber),
    "Couldn't build the invoice PDF.",
  );
}

/** `INV-26-27/000036` → `INV-26-27-000036.pdf`; a slash is a path separator. */
export function invoicePdfFilename(invoiceNumber: string): string {
  return `${invoiceNumber.replace(/[\\/:*?"<>|]+/g, "-")}.pdf`;
}
