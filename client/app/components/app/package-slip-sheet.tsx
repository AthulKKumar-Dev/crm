import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import { Button } from "~/components/ui/button";
import { PackageSlip, type PackageSlipStore } from "~/components/app/package-slip";
import { buildPageCss, chunkPages, type CustomStock } from "~/lib/label-stock";
import {
  SLIP_DEFAULT_CUSTOM,
  SLIP_LAYOUTS,
  SLIP_PAPERS,
  SLIP_PAPER_GROUPS,
  resolveSlipProfile,
  slipFitWarning,
  slipScale,
  type SlipLayout,
} from "~/lib/slip-stock";
import type { OrderSlipData } from "~/types/api";

/**
 * Toolbar + paged sheet for package slips. Owns the paper choice, the layout,
 * the print CSS and the N-up paging; `PackageSlip` owns the artwork.
 *
 * Both print routes render this, which is the point: the per-order slip and a
 * 4-up batch differ only in how many orders they are handed.
 *
 * Geometry is inline in millimetres rather than in classes, for the reason
 * documented on `buildPageCss` — Tailwind cannot emit arbitrary runtime values,
 * and the screen preview must be the same numbers as the paper.
 */

const CUSTOM_PAPER_ID = "__custom__";

/**
 * Per-print overrides for the store block.
 *
 * The resolved store profile is the source of truth, but a merchant printing
 * right now should not have to go to Settings to fix a phone number — and
 * before the Store Profile tab is filled in at all, this is the only way to get
 * a real From block onto the paper. BLANK MEANS INHERIT, never "print nothing":
 * an empty box falls through to the profile, so clearing a field is how you go
 * back to the shared value.
 */
export interface SlipStoreOverrides {
  name: string;
  /** One address line per newline. Blank inherits the resolved address. */
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  logoUrl: string;
}

const EMPTY_OVERRIDES: SlipStoreOverrides = {
  name: "",
  address: "",
  phone: "",
  whatsapp: "",
  email: "",
  website: "",
  logoUrl: "",
};

export interface SlipSheetOptions {
  paperId: string;
  layout: SlipLayout;
  custom: CustomStock;
  showBarcodeZone: boolean;
  showItems: boolean;
  overrides: SlipStoreOverrides;
}

function defaultOptions(paperId: string, layout: SlipLayout): SlipSheetOptions {
  return {
    paperId,
    layout,
    custom: SLIP_DEFAULT_CUSTOM,
    showBarcodeZone: true,
    showItems: false,
    overrides: EMPTY_OVERRIDES,
  };
}

function loadOptions(
  storageKey: string,
  paperId: string,
  layout: SlipLayout,
): SlipSheetOptions {
  const fallback = defaultOptions(paperId, layout);
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as Partial<SlipSheetOptions>;
    // Spread over the defaults so a blob written by an older build — or one
    // naming a paper that no longer exists — still yields a usable shape.
    return {
      ...fallback,
      ...parsed,
      custom: { ...fallback.custom, ...(parsed.custom ?? {}) },
      overrides: { ...EMPTY_OVERRIDES, ...(parsed.overrides ?? {}) },
    };
  } catch {
    return fallback;
  }
}

export function PackageSlipSheet({
  orders,
  store,
  storageKey,
  defaultPaperId,
  defaultLayout,
  backTo,
  backLabel = "Back",
}: {
  orders: OrderSlipData[];
  store: PackageSlipStore;
  /** Separate per route: printing one parcel and printing the day's batch are
   *  different jobs and merchants pick different paper for each. */
  storageKey: string;
  defaultPaperId: string;
  defaultLayout: SlipLayout;
  backTo: string;
  backLabel?: string;
}) {
  const [options, setOptions] = useState<SlipSheetOptions>(() =>
    loadOptions(storageKey, defaultPaperId, defaultLayout),
  );
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(options));
    } catch {
      /* private mode / quota — the preference is a convenience, not state */
    }
  }, [options, storageKey]);

  const set = (patch: Partial<SlipSheetOptions>) =>
    setOptions((o) => ({ ...o, ...patch }));
  const setCustom = (patch: Partial<CustomStock>) =>
    setOptions((o) => ({ ...o, custom: { ...o.custom, ...patch } }));
  const setOverride = (patch: Partial<SlipStoreOverrides>) =>
    setOptions((o) => ({ ...o, overrides: { ...o.overrides, ...patch } }));

  const isCustom = options.paperId === CUSTOM_PAPER_ID;

  const profile = useMemo(
    () =>
      resolveSlipProfile({
        paperId: options.paperId,
        layout: options.layout,
        custom: options.custom,
        useCustom: isCustom,
      }),
    [options.paperId, options.layout, options.custom, isCustom],
  );
  const scale = useMemo(() => slipScale(profile), [profile]);
  const fitWarning = useMemo(() => slipFitWarning(profile), [profile]);
  const pages = useMemo(
    () => chunkPages(orders, profile.perPage, 0),
    [orders, profile.perPage],
  );

  // Blank inherits — see SlipStoreOverrides.
  const effectiveStore = useMemo<PackageSlipStore>(() => {
    const ov = options.overrides;
    const lines = ov.address
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return {
      name: ov.name.trim() || store.name,
      addressLines: lines.length ? lines : store.addressLines,
      phone: ov.phone.trim() || store.phone,
      whatsapp: ov.whatsapp.trim() || store.whatsapp,
      email: ov.email.trim() || store.email,
      website: ov.website.trim() || store.website,
      logoUrl: ov.logoUrl.trim() || store.logoUrl,
    };
  }, [options.overrides, store]);

  const inputCls = "rounded-md border px-2 py-1 text-xs";
  const numCls = "w-16 rounded-md border px-2 py-1 text-xs";
  const fieldCls =
    "w-full rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand/50";

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950">
      <style>{`
        @media print {
          ${buildPageCss(profile)}
          body { background: white !important; }

          /* Whitelist, not blacklist — the same reasoning as the label sheet:
             hiding only .no-print assumes every stray node carries the tag, so
             portals and browser-extension-injected nodes would still print.
             visibility (not display) because it is overridable on descendants,
             so the sheet re-shows while its ancestors stay hidden, and because
             it leaves the page-break boxes intact. */
          body * { visibility: hidden !important; }
          .slip-sheet, .slip-sheet * { visibility: visible !important; }

          /* The toolbar must occupy NO space; visibility alone leaves a gap
             above the first slip. */
          .no-print { display: none !important; }

          .label-page { box-shadow: none !important; margin: 0 !important; }
        }
        /* The header band and care tiles are solid dark fills; without this
           browsers drop backgrounds when printing and they come out blank. */
        .slip-cell { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      `}</style>

      <div className="no-print sticky top-0 z-10 border-b bg-white dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-4 px-6 py-3 text-xs">
          <Link
            to={backTo}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> {backLabel}
          </Link>

          <span className="font-semibold">
            {orders.length} slip{orders.length === 1 ? "" : "s"} · {pages.length} sheet
            {pages.length === 1 ? "" : "s"}
          </span>

          <label className="flex items-center gap-1.5">
            <span className="font-medium text-gray-700 dark:text-gray-300">Paper size</span>
            <select
              value={options.paperId}
              onChange={(e) => set({ paperId: e.target.value })}
              className={inputCls}
            >
              {SLIP_PAPER_GROUPS.map((g) => (
                <optgroup key={g.id} label={g.label}>
                  {SLIP_PAPERS.filter((p) => p.group === g.id).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              <optgroup label="Custom">
                <option value={CUSTOM_PAPER_ID}>Custom size…</option>
              </optgroup>
            </select>
          </label>

          {!isCustom && (
            <label className="flex items-center gap-1.5">
              <span className="font-medium text-gray-700 dark:text-gray-300">Layout</span>
              <select
                value={options.layout}
                onChange={(e) => set({ layout: Number(e.target.value) as SlipLayout })}
                className={inputCls}
              >
                {SLIP_LAYOUTS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {isCustom && (
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                value={options.custom.widthMm}
                onChange={(e) => setCustom({ widthMm: Number(e.target.value) })}
                className={numCls}
                aria-label="Page width in mm"
              />
              <span className="text-muted-foreground">×</span>
              <input
                type="number"
                value={options.custom.heightMm}
                onChange={(e) => setCustom({ heightMm: Number(e.target.value) })}
                className={numCls}
                aria-label="Page height in mm"
              />
              <span className="text-muted-foreground">mm</span>
              <input
                type="number"
                value={options.custom.across}
                onChange={(e) => setCustom({ across: Number(e.target.value) })}
                className={numCls}
                aria-label="Slips across"
              />
              <span className="text-muted-foreground">across ×</span>
              <input
                type="number"
                value={options.custom.down}
                onChange={(e) => setCustom({ down: Number(e.target.value) })}
                className={numCls}
                aria-label="Slips down"
              />
              <span className="text-muted-foreground">down</span>
            </span>
          )}

          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={options.showBarcodeZone}
              onChange={() => set({ showBarcodeZone: !options.showBarcodeZone })}
            />
            Barcode space
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={options.showItems}
              onChange={() => set({ showItems: !options.showItems })}
            />
            Item list
          </label>

          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Pencil className="size-3" /> {editing ? "Done editing" : "Edit store details"}
          </button>

          <span className="text-muted-foreground">
            {profile.pageWidthMm.toFixed(1)} × {profile.pageHeightMm.toFixed(1)} mm page
            {profile.perPage > 1
              ? ` · ${profile.widthMm.toFixed(1)} × ${profile.heightMm.toFixed(1)} mm each`
              : ""}
          </span>

          <Button
            variant="brand"
            size="action"
            className="ml-auto"
            onClick={() => window.print()}
            disabled={orders.length === 0}
          >
            <Printer className="size-3.5" /> Print / Save PDF
          </Button>
        </div>

        {editing && (
          <div className="border-t bg-gray-50 px-6 py-3 dark:bg-gray-800/50">
            <p className="mb-2 text-[11px] text-muted-foreground">
              Overrides for this browser only — leave a box empty to use the value from{" "}
              <Link to="/settings/store-profile" className="underline">
                Settings → Store Profile
              </Link>
              .
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                value={options.overrides.name}
                onChange={(e) => setOverride({ name: e.target.value })}
                placeholder={store.name || "Store name"}
                className={fieldCls}
              />
              <input
                value={options.overrides.phone}
                onChange={(e) => setOverride({ phone: e.target.value })}
                placeholder={store.phone || "Phone"}
                className={fieldCls}
              />
              <input
                value={options.overrides.whatsapp}
                onChange={(e) => setOverride({ whatsapp: e.target.value })}
                placeholder={store.whatsapp || "WhatsApp"}
                className={fieldCls}
              />
              <input
                value={options.overrides.email}
                onChange={(e) => setOverride({ email: e.target.value })}
                placeholder={store.email || "Support email"}
                className={fieldCls}
              />
              <input
                value={options.overrides.website}
                onChange={(e) => setOverride({ website: e.target.value })}
                placeholder={store.website || "Website"}
                className={fieldCls}
              />
              <input
                value={options.overrides.logoUrl}
                onChange={(e) => setOverride({ logoUrl: e.target.value })}
                placeholder={store.logoUrl || "Logo image URL"}
                className={fieldCls}
              />
              <textarea
                value={options.overrides.address}
                onChange={(e) => setOverride({ address: e.target.value })}
                placeholder={
                  store.addressLines.join("\n") || "From address — one line per row"
                }
                rows={3}
                className={`${fieldCls} sm:col-span-3`}
              />
            </div>
          </div>
        )}
      </div>

      {fitWarning && (
        <p className="no-print bg-red-50 px-6 py-2 text-[11px] text-red-800">{fitWarning}</p>
      )}
      <p className="no-print px-6 py-2 text-[11px] text-muted-foreground">
        In the printer dialog: set <strong>Paper size</strong> to the same size chosen above, scale
        to <strong>Actual size</strong> (100%, not “Fit to page”), and leave the printer’s own{" "}
        <strong>Layout</strong> on 1-up / “Borders” — the sheet above is already laid out, so the
        driver’s 2-up or 4-up would tile it a second time. On an inkjet, set Media Type to plain
        paper.
      </p>

      {/* Pages. Each .label-page is one physical page. */}
      <div className="slip-sheet">
        {pages.map((page, pi) => (
          <div
            key={pi}
            className="label-page mx-auto mb-4 bg-white shadow-sm print:shadow-none"
            style={{
              width: `${profile.pageWidthMm}mm`,
              height: `${profile.pageHeightMm}mm`,
              paddingTop: `${profile.marginTopMm}mm`,
              paddingLeft: `${profile.marginLeftMm}mm`,
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${profile.across}, ${profile.widthMm}mm)`,
                gridAutoRows: `${profile.heightMm}mm`,
                columnGap: `${profile.gapXMm}mm`,
                rowGap: `${profile.gapYMm}mm`,
              }}
            >
              {page.map((order, ci) => (
                <div
                  key={order?.id ?? `blank-${pi}-${ci}`}
                  className="label-cell slip-cell"
                  style={{
                    width: `${profile.widthMm}mm`,
                    height: `${profile.heightMm}mm`,
                    padding: `${profile.paddingMm}mm`,
                    boxSizing: "border-box",
                    overflow: "hidden",
                    // Cut guides only when the sheet holds more than one slip.
                    outline: profile.guides ? "0.2mm dashed #cbd5e1" : undefined,
                    outlineOffset: "-0.1mm",
                  }}
                >
                  {order && (
                    <PackageSlip
                      order={order}
                      store={effectiveStore}
                      scale={scale}
                      showBarcodeZone={options.showBarcodeZone}
                      showItems={options.showItems}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
