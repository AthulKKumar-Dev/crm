import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Package, Printer } from "lucide-react";
import { useOrder } from "~/hooks/use-order-queries";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import type { VendorShipTo } from "~/types/api";

/** Loose shape covering both the vendor projection and the full owner order. */
type SlipOrder = {
  name: string;
  createdAt?: string;
  externalCreatedAt?: string;
  shipTo?: VendorShipTo | null;
  shippingAddress?: Record<string, unknown> | null;
  customer?: { firstName?: string | null; lastName?: string | null } | null;
  lineItems: Array<{
    id: string;
    title: string;
    variantTitle: string | null;
    sku: string | null;
    quantity: number;
    imageUrl?: string | null;
  }>;
};

type SlipOptions = {
  company: boolean;
  companyName: string;
  shipTo: boolean;
  images: boolean;
  sku: boolean;
  summary: boolean;
  fromAddress: string;
  note: string;
};

function defaultOptions(variant: "packing" | "pick"): SlipOptions {
  return {
    company: true,
    companyName: "Collabo",
    shipTo: variant === "packing",
    images: variant === "packing",
    sku: variant === "pick",
    summary: true,
    fromAddress: "",
    note: "",
  };
}

/** Normalise ship-to from either the vendor projection or a raw owner address. */
function resolveShipTo(order: SlipOrder): VendorShipTo | null {
  if (order.shipTo) return order.shipTo;
  const a = order.shippingAddress;
  if (!a || typeof a !== "object") {
    const nm = [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ");
    return nm
      ? { name: nm, company: null, address1: null, address2: null, city: null, province: null, zip: null, country: null }
      : null;
  }
  const get = (k: string) => (typeof (a as Record<string, unknown>)[k] === "string" ? ((a as Record<string, unknown>)[k] as string) : null);
  return {
    name:
      get("name") ??
      ([get("first_name") ?? get("firstName"), get("last_name") ?? get("lastName")]
        .filter(Boolean)
        .join(" ") || null),
    company: get("company"),
    address1: get("address1") ?? get("address_1"),
    address2: get("address2") ?? get("address_2"),
    city: get("city"),
    province: get("province") ?? get("province_code") ?? get("state"),
    zip: get("zip") ?? get("postal_code") ?? get("pincode"),
    country: get("country") ?? get("country_code"),
  };
}

/**
 * Print-friendly packing / pick slip with a (non-printed) customization bar.
 * Works for both the vendor projection and the full owner order. Toggle choices
 * persist in localStorage so the layout sticks between prints.
 */
export function OrderSlip({ variant }: { variant: "packing" | "pick" }) {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useOrder(id);
  const order = data as unknown as SlipOrder | undefined;
  const { data: org } = useCurrentOrg();

  const storageKey = `slip-opts-${variant}`;
  const [opts, setOpts] = useState<SlipOptions>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) return { ...defaultOptions(variant), ...JSON.parse(saved) };
      } catch {
        /* ignore malformed storage */
      }
    }
    return defaultOptions(variant);
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(opts));
      } catch {
        /* ignore */
      }
    }
  }, [opts, storageKey]);

  if (isLoading || !order) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading slip…
      </div>
    );
  }

  const title = variant === "packing" ? "Packing Slip" : "Pick Slip";
  const dateStr = new Date(order.externalCreatedAt ?? order.createdAt ?? "").toLocaleDateString(
    "en-IN",
    { day: "2-digit", month: "long", year: "numeric" },
  );
  const ship = resolveShipTo(order);
  const totalUnits = order.lineItems.reduce((n, li) => n + li.quantity, 0);
  const set = (patch: Partial<SlipOptions>) => setOpts((o) => ({ ...o, ...patch }));

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950">
      <style>{`@media print {
        @page { size: A4; margin: 14mm; }
        body { background: #fff !important; }
        .no-print { display: none !important; }
        .slip-paper { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
      }`}</style>

      {/* Customization bar — never printed */}
      <div className="no-print sticky top-0 z-10 border-b bg-white/95 backdrop-blur dark:bg-gray-900/95">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              to={`/orders/${id}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100"
            >
              <ArrowLeft className="size-3.5" /> Back
            </Link>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Toggle label="Company header" checked={opts.company} onChange={(v) => set({ company: v })} />
              <Toggle label="Ship to" checked={opts.shipTo} onChange={(v) => set({ shipTo: v })} />
              <Toggle label="Images" checked={opts.images} onChange={(v) => set({ images: v })} />
              <Toggle label="SKU" checked={opts.sku} onChange={(v) => set({ sku: v })} />
              <Toggle label="Summary" checked={opts.summary} onChange={(v) => set({ summary: v })} />
            </div>
            <button
              onClick={() => window.print()}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900"
            >
              <Printer className="size-3.5" /> Print / Save PDF
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <input
              value={opts.companyName}
              onChange={(e) => set({ companyName: e.target.value })}
              placeholder="Company name"
              className="rounded-lg border bg-white px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#cdff8c] dark:bg-gray-800"
            />
            <input
              value={opts.fromAddress}
              onChange={(e) => set({ fromAddress: e.target.value })}
              placeholder="From / return address (optional)"
              className="rounded-lg border bg-white px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#cdff8c] dark:bg-gray-800"
            />
            <input
              value={opts.note}
              onChange={(e) => set({ note: e.target.value })}
              placeholder="Note shown on the slip (optional)"
              className="rounded-lg border bg-white px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#cdff8c] dark:bg-gray-800"
            />
          </div>
        </div>
      </div>

      {/* The slip paper */}
      <div className="slip-paper mx-auto my-6 max-w-3xl bg-white p-10 text-[12px] text-gray-900 shadow-sm">
        {/* Header */}
        <div className="flex items-start justify-between gap-6 border-b border-gray-200 pb-5">
          <div className="min-w-0">
            {opts.company && (
              <div className="flex items-center gap-3">
                {org?.logo && (
                  <img src={org.logo} alt="" className="h-10 w-auto max-w-[120px] object-contain" />
                )}
                <div>
                  <p className="text-base font-bold">{opts.companyName || "Collabo"}</p>
                  {org?.website && <p className="text-[11px] text-gray-500">{org.website}</p>}
                </div>
              </div>
            )}
            {opts.fromAddress && (
              <p className="mt-2 whitespace-pre-line text-[11px] leading-4 text-gray-600">
                {opts.fromAddress}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-[12px] font-medium">Order {order.name}</p>
            {dateStr && <p className="text-[11px] text-gray-500">{dateStr}</p>}
          </div>
        </div>

        {/* Ship to */}
        {opts.shipTo && (
          <div className="mt-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Ship to</p>
            {ship ? (
              <div className="mt-1 leading-5">
                {ship.name && <p className="font-semibold">{ship.name}</p>}
                {ship.company && <p>{ship.company}</p>}
                {ship.address1 && <p>{ship.address1}</p>}
                {ship.address2 && <p>{ship.address2}</p>}
                <p>{[ship.city, ship.province, ship.zip].filter(Boolean).join(", ")}</p>
                {ship.country && <p>{ship.country}</p>}
              </div>
            ) : (
              <p className="mt-1 italic text-gray-400">No shipping address.</p>
            )}
          </div>
        )}

        {/* Items */}
        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="border-y border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-500">
              <th className="py-2 pr-2 font-semibold">#</th>
              <th className="py-2 pr-2 font-semibold">Item</th>
              {opts.sku && <th className="py-2 pr-2 font-semibold">SKU</th>}
              <th className="py-2 pl-2 text-right font-semibold">Qty</th>
              {variant === "pick" && (
                <th className="w-12 py-2 pl-2 text-center font-semibold">Picked</th>
              )}
            </tr>
          </thead>
          <tbody>
            {order.lineItems.map((li, i) => (
              <tr key={li.id} className="border-b border-gray-100 align-top">
                <td className="py-2.5 pr-2 tabular-nums text-gray-400">{i + 1}</td>
                <td className="py-2.5 pr-2">
                  <div className="flex items-center gap-2.5">
                    {opts.images &&
                      (li.imageUrl ? (
                        <img
                          src={li.imageUrl}
                          alt=""
                          className="size-9 shrink-0 rounded object-cover ring-1 ring-gray-200"
                        />
                      ) : (
                        <div className="flex size-9 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-400">
                          <Package className="size-4" />
                        </div>
                      ))}
                    <div className="min-w-0">
                      <p className="font-medium">{li.title}</p>
                      {li.variantTitle && (
                        <p className="text-[10px] text-gray-500">{li.variantTitle}</p>
                      )}
                    </div>
                  </div>
                </td>
                {opts.sku && (
                  <td className="py-2.5 pr-2 font-mono text-[11px] text-gray-600">{li.sku ?? "—"}</td>
                )}
                <td className="py-2.5 pl-2 text-right font-semibold tabular-nums">{li.quantity}</td>
                {variant === "pick" && (
                  <td className="py-2.5 pl-2 text-center">
                    <span className="inline-block size-4 rounded-sm border border-gray-400" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary */}
        {opts.summary && (
          <div className="mt-4 flex justify-end gap-6 text-[11px] text-gray-600">
            <span>
              Lines: <span className="font-semibold text-gray-900">{order.lineItems.length}</span>
            </span>
            <span>
              Total units: <span className="font-semibold text-gray-900">{totalUnits}</span>
            </span>
          </div>
        )}

        {/* Note */}
        {opts.note && (
          <div className="mt-6 border-t border-gray-200 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Note</p>
            <p className="mt-1 whitespace-pre-line text-[11px] leading-5 text-gray-700">{opts.note}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-700 dark:text-gray-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5"
      />
      {label}
    </label>
  );
}
