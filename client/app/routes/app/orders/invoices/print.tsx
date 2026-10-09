import { useEffect, useRef } from "react";
import { useParams } from "react-router";
import { InvoiceDocument } from "~/components/app/invoice-document";
import { useInvoice } from "~/hooks/use-invoice-queries";

export function meta() {
  return [{ title: "Bill | Collabo CRM" }];
}

/**
 * Printable invoice. The layout lives in `InvoiceDocument`, shared with the
 * invoice page; this route only loads the data, opens the print dialog and
 * hides the chrome under `@media print`.
 */
export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const { data: invoice, isLoading, isError, refetch } = useInvoice(id);
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

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <InvoiceDocument invoice={invoice} />

      <div className="no-print mx-auto mt-2 flex max-w-3xl justify-end px-8 pb-8">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800"
        >
          Print / Save as PDF
        </button>
      </div>
    </>
  );
}
