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
  /** Owner detail only — absent on the vendor projection. */
  email?: string | null;
  note?: string | null;
  shipTo?: VendorShipTo | null;
  shippingAddress?: Record<string, unknown> | null;
  billingAddress?: Record<string, unknown> | null;
  customer?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  lineItems: Array<{
    id: string;
    title: string;
    variantTitle: string | null;
    sku: string | null;
    quantity: number;
    imageUrl?: string | null;
  }>;
};

type SlipAddress = VendorShipTo & { phone: string | null };

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
    sku: true,
    summary: true,
    fromAddress: "",
    note: "",
  };
}

/** Normalise a raw address bag (shipping or billing) into a flat shape. */
function resolveAddress(a: Record<string, unknown> | null | undefined): SlipAddress | null {
  if (!a || typeof a !== "object") return null;
  const get = (k: string) =>
    typeof (a as Record<string, unknown>)[k] === "string" && (a as Record<string, unknown>)[k]
      ? ((a as Record<string, unknown>)[k] as string)
      : null;
  const addr: SlipAddress = {
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
    phone: get("phone"),
  };
  return Object.values(addr).some(Boolean) ? addr : null;
}

/** Normalise ship-to from either the vendor projection or a raw owner address. */
function resolveShipTo(order: SlipOrder): SlipAddress | null {
  if (order.shipTo) return { ...order.shipTo, phone: null };
  const resolved = resolveAddress(order.shippingAddress);
  if (resolved) return resolved;
  const nm = [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ");
  return nm
    ? {
        name: nm,
        company: null,
        address1: null,
        address2: null,
        city: null,
        province: null,
        zip: null,
        country: null,
        phone: null,
      }
    : null;
}

/** Multi-line street/city/country block, or an em dash when empty. */
function AddressLines({ a }: { a: SlipAddress | null }) {
  if (!a || !(a.address1 || a.address2 || a.city || a.province || a.zip || a.country)) {
    return <p className="value">—</p>;
  }
  return (
    <p className="value">
      {a.address1}
      {a.address2 ? `, ${a.address2}` : ""}
      <br />
      {a.city}
      {a.province ? `, ${a.province}` : ""}
      {a.zip ? ` – ${a.zip}` : ""}
      <br />
      {a.country}
    </p>
  );
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
      {variant === "packing" ? (
        <style>{PACKING_CSS}</style>
      ) : (
        <style>{`@media print {
          @page { size: A4; margin: 14mm; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .slip-paper { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
        }`}</style>
      )}

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
              {variant === "pick" && (
                <Toggle label="Ship to" checked={opts.shipTo} onChange={(v) => set({ shipTo: v })} />
              )}
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
            {variant === "pick" && (
              <input
                value={opts.fromAddress}
                onChange={(e) => set({ fromAddress: e.target.value })}
                placeholder="From / return address (optional)"
                className="rounded-lg border bg-white px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#cdff8c] dark:bg-gray-800"
              />
            )}
            <input
              value={opts.note}
              onChange={(e) => set({ note: e.target.value })}
              placeholder="Note shown on the slip (optional)"
              className="rounded-lg border bg-white px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#cdff8c] dark:bg-gray-800"
            />
          </div>
        </div>
      </div>

      {variant === "packing" ? (
        <PackingSlipBody
          order={order}
          opts={opts}
          dateStr={dateStr}
          ship={ship}
          orgName={org?.name}
          orgWebsite={org?.website}
          totalUnits={totalUnits}
        />
      ) : (
        <PickSlipBody
          order={order}
          opts={opts}
          orgLogo={org?.logo}
          orgWebsite={org?.website}
          title={title}
          dateStr={dateStr}
          ship={ship}
          totalUnits={totalUnits}
        />
      )}
    </div>
  );
}

/** The Courier/boxed packing-slip layout (ported from the Shopify Liquid template). */
function PackingSlipBody({
  order,
  opts,
  dateStr,
  ship,
  orgName,
  orgWebsite,
  totalUnits,
}: {
  order: SlipOrder;
  opts: SlipOptions;
  dateStr: string;
  ship: SlipAddress | null;
  orgName?: string | null;
  orgWebsite?: string | null;
  totalUnits: number;
}) {
  const storeName = (opts.companyName || orgName || "Collabo").toUpperCase();
  const billing = resolveAddress(order.billingAddress);
  const customerName =
    [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ") ||
    ship?.name ||
    "—";
  const customerEmail = order.email ?? order.customer?.email ?? "—";
  const hasNote = Boolean(order.note || opts.note);

  return (
    <div className="packing-slip">
      <div className="box">
        {/* TOP ROW: STORE NAME | ORDER # */}
        <div className="row top-row">
          <div className="col col-center store-name">{opts.company ? storeName : ""}</div>
          <div className="col col-right">ORDER {order.name}</div>
        </div>

        <div className="row sub-row">
          <div className="col col-center"></div>
          <div className="col col-right">Date: {dateStr}</div>
        </div>

        <div className="divider"></div>

        {/* CUSTOMER / SHIPPING / BILLING */}
        <div className="row headings-row">
          <div className="col col-third">CUSTOMER DETAILS</div>
          <div className="col col-third">SHIPPING ADDRESS</div>
          <div className="col col-third">BILLING ADDRESS</div>
        </div>

        <div className="row details-row">
          <div className="col col-third">
            <p>
              <span className="label">Name</span>: <span className="value">{customerName}</span>
            </p>
            <p>
              <span className="label">Email</span>: <span className="value">{customerEmail}</span>
            </p>
          </div>

          <div className="col col-third">
            <p className="label">Address</p>
            <AddressLines a={ship} />
            <p className="label">Phone</p>
            <p className="value">{ship?.phone ?? "—"}</p>
          </div>

          <div className="col col-third">
            <p className="label">Address</p>
            <AddressLines a={billing} />
            <p className="label">Phone</p>
            <p className="value">{billing?.phone ?? "—"}</p>
          </div>
        </div>

        <div className="divider"></div>

        {/* ITEMS TABLE */}
        <div className="row items-header-row">
          {opts.images && <div className="col item-image-col">IMAGE</div>}
          <div className="col item-name-col">PRODUCT NAME</div>
          {opts.sku && <div className="col item-sku-col">SKU</div>}
          <div className="col item-qty-col">QTY</div>
        </div>

        <div className="divider thin"></div>

        {order.lineItems.map((li) => (
          <div className="row item-row" key={li.id}>
            {opts.images && (
              <div className="col item-image-col">
                {li.imageUrl ? (
                  <img className="item-image" src={li.imageUrl} alt={li.title} width={40} height={40} />
                ) : (
                  <div className="item-image-placeholder">
                    <Package size={16} />
                  </div>
                )}
              </div>
            )}
            <div className="col item-name-col">
              {li.title}
              {li.variantTitle && li.variantTitle !== "Default Title" && (
                <span className="item-variant"> ({li.variantTitle})</span>
              )}
            </div>
            {opts.sku && <div className="col item-sku-col">{li.sku ?? "—"}</div>}
            <div className="col item-qty-col">{li.quantity}</div>
          </div>
        ))}

        {opts.summary && (
          <div className="row summary-row">
            Lines: {order.lineItems.length} &nbsp;·&nbsp; Total units: {totalUnits}
          </div>
        )}

        <div className="divider"></div>

        {/* NOTES */}
        {hasNote && (
          <>
            <div className="row note-row">
              <span className="label">Customer Note / Delivery Instructions</span>
              {order.note && <p className="value">{order.note}</p>}
              {opts.note && <p className="value">{opts.note}</p>}
            </div>
            <div className="divider"></div>
          </>
        )}

        {/* FOOTER */}
        <div className="row footer-row">
          <div className="col col-left">Thank you for choosing {opts.companyName || orgName || "Collabo"}</div>
          <div className="col col-right">{orgWebsite}</div>
        </div>
      </div>
    </div>
  );
}

/** The original clean slip layout, kept for the pick variant. */
function PickSlipBody({
  order,
  opts,
  orgLogo,
  orgWebsite,
  title,
  dateStr,
  ship,
  totalUnits,
}: {
  order: SlipOrder;
  opts: SlipOptions;
  orgLogo?: string | null;
  orgWebsite?: string | null;
  title: string;
  dateStr: string;
  ship: SlipAddress | null;
  totalUnits: number;
}) {
  return (
    <div className="slip-paper mx-auto my-6 max-w-3xl bg-white p-10 text-[12px] text-gray-900 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-6 border-b border-gray-200 pb-5">
        <div className="min-w-0">
          {opts.company && (
            <div className="flex items-center gap-3">
              {orgLogo && (
                <img src={orgLogo} alt="" className="h-10 w-auto max-w-[120px] object-contain" />
              )}
              <div>
                <p className="text-base font-bold">{opts.companyName || "Collabo"}</p>
                {orgWebsite && <p className="text-[11px] text-gray-500">{orgWebsite}</p>}
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
            <th className="w-12 py-2 pl-2 text-center font-semibold">Picked</th>
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
              <td className="py-2.5 pl-2 text-center">
                <span className="inline-block size-4 rounded-sm border border-gray-400" />
              </td>
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
  );
}

/** CSS ported from the user-supplied Shopify Liquid packing-slip template. */
const PACKING_CSS = `
.packing-slip, .packing-slip *{
  box-sizing:border-box;
}

@page{
  size:A4;
  margin:0;
}

.packing-slip{
  width:700px;
  max-width:100%;
  margin:0 auto;
  padding:20px;
  background:#fff;
  font-family:"Courier New", Courier, monospace;
  font-size:12px;
  color:#111;
}

.packing-slip .box{
  border:2px solid #000;
  padding:18px;
}

/*=========================
ROWS
=========================*/

.packing-slip .row{
  display:flex;
  width:100%;
  padding:6px 0;
}

.packing-slip .col{
  flex:1;
  min-width:0;
}

.packing-slip .col-left{
  text-align:left;
}

.packing-slip .col-center{
  flex:2;
}

.packing-slip .col-right{
  text-align:right;
}

.packing-slip .col-third{
  flex:1;
  width:33.333%;
  min-width:0;
  padding-right:20px;
  overflow:hidden;
}

/*=========================
HEADER
=========================*/

.packing-slip .top-row{
  align-items:center;
}

.packing-slip .store-name{
  flex:1;
  text-align:left;
  font-size:18px;
  font-weight:bold;
  letter-spacing:2px;
}

.packing-slip .sub-row{
  color:#555;
}

/*=========================
DIVIDERS
=========================*/

.packing-slip .divider{
  margin:12px 0;
  border-top:1px solid #000;
}

.packing-slip .divider.thin{
  margin:8px 0;
  border-top:1px solid #000;
}

/*=========================
HEADINGS
=========================*/

.packing-slip .headings-row{
  font-weight:bold;
  letter-spacing:1px;
}

.packing-slip .details-row{
  display:flex;
  align-items:flex-start;
  padding-top:4px;
}

.packing-slip .details-row .col-third{
  flex:1;
  min-width:0;
}

.packing-slip .label{
  margin:4px 0 2px;
  font-weight:bold;
  color:#000;
}

.packing-slip .value{
  margin:0 0 8px;
  color:#333;
  line-height:1.5;
  white-space:normal;
  overflow-wrap:anywhere;
  word-break:break-word;
}

.packing-slip .details-row p{
  margin:0 0 6px;
}

/*=========================
PRODUCT TABLE
=========================*/

.packing-slip .items-header-row{
  font-weight:bold;
  letter-spacing:1px;
}

.packing-slip .item-image-col{
  width:55px;
  min-width:55px;
  flex:none;
}

.packing-slip .item-name-col{
  flex:2;
  padding-right:12px;
}

.packing-slip .item-sku-col{
  width:90px;
  min-width:90px;
  flex:none;
  text-align:left;
}

.packing-slip .item-qty-col{
  width:60px;
  min-width:60px;
  flex:none;
  text-align:left;
}

.packing-slip .item-row{
  display:flex;
  align-items:center;
  padding:10px 0;
  border-bottom:1px solid #ddd;
}

.packing-slip .item-image{
  display:block;
  border:none;
  width:40px;
  height:40px;
  object-fit:cover;
}

.packing-slip .item-image-placeholder{
  display:flex;
  align-items:center;
  justify-content:center;
  width:40px;
  height:40px;
  border:1px solid #ddd;
  color:#999;
}

.packing-slip .item-variant{
  color:#666;
  font-size:11px;
}

.packing-slip .summary-row{
  justify-content:flex-end;
  color:#555;
}

.packing-slip .notice-row{
  color:#555;
  font-style:italic;
}

/*=========================
NOTES
=========================*/

.packing-slip .note-row{
  display:block;
  padding:6px 0;
}

.packing-slip .note-row .label{
  display:block;
  font-weight:bold;
  margin-bottom:6px;
}

/*=========================
FOOTER
=========================*/

.packing-slip .footer-row{
  display:flex;
  align-items:center;
  padding-top:10px;
}

.packing-slip .footer-row .col-right{
  text-align:right;
}

/*=========================
SCREEN PREVIEW
=========================*/

@media screen{
  .packing-slip{
    margin:24px auto;
    box-shadow:0 1px 2px rgba(0,0,0,0.08);
  }
}

/*=========================
PRINT
=========================*/

@media print{
  body{
    background:#fff !important;
  }

  .no-print{
    display:none !important;
  }

  .packing-slip{
    width:100%;
    padding:10px;
    margin:0;
    box-shadow:none;
  }
}
`;

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
