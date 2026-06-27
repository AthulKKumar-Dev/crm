import { useEffect } from "react";
import { useParams } from "react-router";
import { useOrder } from "~/hooks/use-order-queries";
import type { VendorOrderDetail as VendorOrder } from "~/types/api";

/**
 * Print-friendly packing / pick slip for a VENDOR's slice of an order.
 * Reuses the vendor order endpoint (their items only, no prices). Auto-opens the
 * browser print dialog, mirroring the invoice print route.
 */
export function OrderSlip({ variant }: { variant: "packing" | "pick" }) {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useOrder(id);
  const order = data as unknown as VendorOrder | undefined;

  useEffect(() => {
    if (order) {
      const t = setTimeout(() => window.print(), 250);
      return () => clearTimeout(t);
    }
  }, [order]);

  if (isLoading || !order) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading slip…
      </div>
    );
  }

  const title = variant === "packing" ? "Packing Slip" : "Pick Slip";
  const s = order.shipTo;

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
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            <p className="text-[11px] text-gray-600">Order {order.name}</p>
          </div>
          <div className="text-right text-[11px] text-gray-600">
            {new Date(order.createdAt).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </div>
        </div>

        {/* Ship to (packing slip) */}
        {variant === "packing" && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Ship to</p>
            {s ? (
              <div className="mt-1 text-[12px] leading-5">
                {s.name && <p className="font-semibold">{s.name}</p>}
                {s.company && <p>{s.company}</p>}
                {s.address1 && <p>{s.address1}</p>}
                {s.address2 && <p>{s.address2}</p>}
                <p>{[s.city, s.province, s.zip].filter(Boolean).join(", ")}</p>
                {s.country && <p>{s.country}</p>}
              </div>
            ) : (
              <p className="mt-1 text-gray-500 italic">No shipping address.</p>
            )}
          </div>
        )}

        {/* Items */}
        <table className="mt-4 w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="px-2 py-1.5 font-medium">Item</th>
              {variant === "pick" && <th className="px-2 py-1.5 font-medium">SKU</th>}
              <th className="px-2 py-1.5 text-right font-medium">Qty</th>
            </tr>
          </thead>
          <tbody>
            {order.lineItems.map((li) => (
              <tr key={li.id} className="border-b last:border-b-0">
                <td className="px-2 py-1.5">
                  {li.title}
                  {li.variantTitle ? (
                    <span className="text-gray-500"> — {li.variantTitle}</span>
                  ) : null}
                </td>
                {variant === "pick" && (
                  <td className="px-2 py-1.5 font-mono text-gray-700">{li.sku ?? "—"}</td>
                )}
                <td className="px-2 py-1.5 text-right tabular-nums">{li.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-4 text-[11px] text-gray-600">
          {order.lineItems.reduce((n, li) => n + li.quantity, 0)} unit(s) across{" "}
          {order.lineItems.length} line(s).
        </p>

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
