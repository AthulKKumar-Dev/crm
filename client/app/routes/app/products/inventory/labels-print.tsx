import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "~/components/ui/button";
import { inventoryService } from "~/services/inventory.service";
import { inventoryKeys } from "~/hooks/use-inventory-queries";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { formatCurrency } from "~/lib/utils";
import {
  detectSymbology,
  planBarcode,
  MIN_BAR_HEIGHT_MM,
  MIN_BAR_HEIGHT_SMALL_MM,
  HARD_FLOOR_X_MM,
  dotPitchMm,
  type BarcodePlan,
  type Symbology,
} from "~/lib/barcode";
import {
  LABEL_PRESETS,
  CUSTOM_PRESET_ID,
  DEFAULT_CUSTOM,
  resolveProfile,
  buildPageCss,
  chunkPages,
  findPreset,
  presetsBySize,
  type CustomStock,
  type ResolvedProfile,
  type PrintableWindow,
} from "~/lib/label-stock";
import type { LabelData } from "~/types/api";

/**
 * Barcode label printing.
 *
 * Three layers, and they stay separate: the STOCK (a preset or a custom W×H)
 * decides page geometry, the LAYOUT (across/down, gaps, margins) decides where
 * labels sit on it, and the CONTENT toggles decide what goes inside. One
 * barcode engine (`~/lib/barcode`) serves every size — there is never a
 * per-size generator. The symbol's physical size is computed from its
 * symbology and the printable width the stock leaves it.
 *
 * Barcode geometry contract — a future edit will silently break this:
 *   One SVG user unit is one module. JsBarcode is used ONLY as an encoder;
 *   the bars are plain <rect>s. The SVG's width is set in millimetres to
 *   `totalModules × moduleMm` and must NEVER be `w-full`, a percentage, or
 *   anything else that lets the container decide it — that was the original
 *   bug: module width scaled with SKU length, so one roll printed X anywhere
 *   from 0.23 mm to 0.41 mm with no quiet zone. `preserveAspectRatio="none"`
 *   is correct *because* the width is exact: it pins the horizontal scale
 *   while bar height (a free parameter) varies. Module width is snapped to
 *   whole printer dots (25.4/dpi; 0.1251 mm at 203 dpi) so every bar edge
 *   rounds the same way.
 *
 * Symbology is auto-detected from the stored value: a valid EAN-13 / UPC-A /
 * EAN-8 check digit prints in that symbology, everything else in Code 128. A
 * check digit is NEVER fabricated.
 *
 * Jewellery stock is not fully printable — a barbell tag is two small panels
 * with a keep-clear strap between them. Those presets carry `printableWindows`
 * and the barcode is fitted to the window, not the media.
 *
 * Rendered chrome-free: the route ends in `/print`, which the app layout's
 * existing regex treats like packing-slip/pick-slip. Options persist in
 * localStorage (same pattern as order-slip.tsx).
 */

const OPTS_KEY = "label-print-opts";
/** Batch ceiling across the whole run. */
const MAX_LABELS = 1000;
/** Per-variant ceiling. Distinct from MAX_LABELS — both are now honest. */
const MAX_QTY_PER_VARIANT = 100;

interface LabelOptions {
  showTitle: boolean;
  showSku: boolean;
  showPrice: boolean;
  /** Human-readable digits under EAN/UPC bars — GS1 requires HRI on retail symbols. */
  showHri: boolean;
  presetId: string;
  custom: CustomStock;
  startOffset: number;
  nudgeXMm: number;
  nudgeYMm: number;
  dpi: number;
  preferDots: number | "auto";
}

const DEFAULT_OPTIONS: LabelOptions = {
  showTitle: true,
  showSku: true,
  showPrice: false,
  showHri: true,
  presetId: "roll-50x25",
  custom: DEFAULT_CUSTOM,
  startOffset: 0,
  nudgeXMm: 0,
  nudgeYMm: 0,
  dpi: 203,
  preferDots: "auto",
};

function loadOptions(): LabelOptions {
  if (typeof window === "undefined") return DEFAULT_OPTIONS;
  try {
    const raw = JSON.parse(localStorage.getItem(OPTS_KEY) ?? "{}");
    const merged: LabelOptions = { ...DEFAULT_OPTIONS, ...raw };
    merged.custom = { ...DEFAULT_CUSTOM, ...(raw?.custom ?? {}) };
    // Options written before presets existed carry `mode: "sheet" | "thermal"`
    // and no presetId. Map it once so a merchant who chose the label roll keeps
    // the label roll. Not a migration — nothing is versioned.
    if (raw?.mode && !raw?.presetId) {
      merged.presetId = raw.mode === "thermal" ? "roll-50x25" : "sheet-a4-plain";
    }
    return merged;
  } catch {
    return DEFAULT_OPTIONS;
  }
}

/** Text sizes track label height — a 10 mm tag and a 70 mm carton can't share one. */
function typeScale(heightMm: number): number {
  return Math.min(1.4, Math.max(0.7, heightMm / 25));
}

/**
 * Text rows sharing the label's height with the bars. On windowed (jewellery)
 * dies the barcode panel carries only the HRI line — title/SKU/price live on
 * the opposite panel — so only that row competes for height there.
 */
function textRowCount(o: LabelOptions, sym: Symbology, inWindow: boolean): number {
  let rows = 0;
  const hasHri = o.showHri && sym !== "CODE128";
  if (inWindow) return hasHri ? 1 : 0;
  if (o.showTitle) rows++;
  if (o.showSku || o.showPrice) rows++;
  if (hasHri) rows++;
  return rows;
}

/**
 * Longest Code 128 alphanumeric code that fits, from `modules = 11N + 35` plus
 * the 20-module quiet zone, at the hard floor. Approximate by design — Code C
 * packs digits two per symbol, so numeric codes get roughly double this.
 */
function maxCodeChars(availableMm: number): number {
  const modules = Math.floor(availableMm / HARD_FLOOR_X_MM);
  return Math.max(0, Math.floor((modules - 20 - 35) / 11));
}

/**
 * A remedy that is actually available.
 *
 * The previous text said "try larger stock, a 300 dpi printer, or a shorter
 * code". Two things were wrong with it: it was shown to merchants already on
 * 300 dpi, and — verified by sweeping 356 unfit cases across every code and
 * width — **a finer printer never rescues an unfit verdict at all.** `unfit`
 * is reached only when `maxFit < HARD_FLOOR_X_MM`, and `maxFit` is
 * `availableMm / totalModules`: no dpi term. Raising dpi buys finer steps
 * ABOVE the floor, never a lower floor. So the only real remedies are wider
 * stock or a shorter code, and both are named concretely here.
 */
function fitRemedy(args: {
  plan: BarcodePlan;
  profile: ResolvedProfile;
  value: string;
}): string {
  const { plan, profile, value } = args;
  const parts: string[] = [];

  const neededMm = plan.totalModules * HARD_FLOOR_X_MM;
  if (plan.totalModules > 0) {
    parts.push(
      `Needs ${neededMm.toFixed(1)} mm, this label gives ${profile.contentWidthMm.toFixed(1)} mm.`,
    );
  }

  // Name a stock that actually fits, rather than "use larger stock".
  const fits = presetsBySize().find((p) => {
    const r = resolveProfile({ presetId: p.id, custom: DEFAULT_CUSTOM });
    if (r.contentWidthMm <= profile.contentWidthMm) return false;
    const trial = planBarcode({
      value,
      availableMm: r.contentWidthMm,
      dpi: p.defaultDpi,
      preferDots: "auto",
      maxBarHeightMm: r.contentHeightMm,
      minBarHeightMm: r.printableWindows ? MIN_BAR_HEIGHT_SMALL_MM : MIN_BAR_HEIGHT_MM,
      thermal: r.kind === "roll",
    });
    return trial.quality !== "unfit";
  });
  if (fits) parts.push(`Fits ${fits.widthMm} × ${fits.heightMm} mm or larger.`);

  const chars = maxCodeChars(profile.contentWidthMm);
  parts.push(
    `On this stock a code of about ${chars} characters fits (roughly ${chars * 2} if digits only).`,
  );

  return parts.join(" ");
}

function BarcodeSvg({ plan }: { plan: BarcodePlan }) {
  if (plan.quality === "unfit" || plan.bars.length === 0 || plan.moduleMm <= 0) return null;
  // Isotropic viewBox: one unit is `moduleMm` on both axes, so the pinned
  // horizontal scale is exactly one module per unit.
  const vbHeight = plan.barHeightMm / plan.moduleMm;
  return (
    <svg
      className="barcode-svg"
      style={{
        width: `${plan.widthMm.toFixed(3)}mm`,
        height: `${plan.barHeightMm.toFixed(3)}mm`,
        display: "block",
        margin: "0 auto",
      }}
      viewBox={`0 0 ${plan.totalModules} ${vbHeight}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${plan.symbology} ${plan.value}`}
    >
      {plan.bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={vbHeight} fill="#000000" />
      ))}
    </svg>
  );
}

function LabelBody({
  label,
  plan,
  options,
  currency,
  scale,
  showBarcode,
  showInfo,
}: {
  label: LabelData;
  plan: BarcodePlan | undefined;
  options: LabelOptions;
  currency: string;
  scale: number;
  showBarcode: boolean;
  showInfo: boolean;
}) {
  const pt = (base: number) => `${(base * scale).toFixed(2)}pt`;
  const hri = options.showHri && plan && plan.symbology !== "CODE128";
  return (
    <>
      {showInfo && options.showTitle && (
        <p
          className="truncate font-semibold leading-tight text-black"
          style={{ fontSize: pt(7) }}
        >
          {label.productTitle}
          {label.variantTitle !== "Default Title" ? ` · ${label.variantTitle}` : ""}
        </p>
      )}
      {showBarcode && plan && <BarcodeSvg plan={plan} />}
      {showBarcode && hri && (
        <p
          className="text-center font-mono leading-tight tracking-[0.15em] text-black"
          style={{ fontSize: pt(6.5) }}
        >
          {plan!.value}
        </p>
      )}
      {showInfo && (options.showSku || options.showPrice) && (
        <div className="flex items-baseline justify-between gap-1">
          {options.showSku && (
            <p
              className="truncate font-mono leading-tight text-black"
              style={{ fontSize: pt(6.5) }}
            >
              {label.sku ?? label.barcode}
            </p>
          )}
          {options.showPrice && (
            <p
              className="shrink-0 font-bold leading-tight text-black"
              style={{ fontSize: pt(7) }}
            >
              {formatCurrency(label.price, currency, { maximumFractionDigits: 0 })}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function LabelCell({
  label,
  plan,
  options,
  profile,
  currency,
}: {
  label: LabelData | null;
  plan: BarcodePlan | undefined;
  options: LabelOptions;
  profile: ResolvedProfile;
  currency: string;
}) {
  const box: React.CSSProperties = {
    width: `${profile.widthMm}mm`,
    height: `${profile.heightMm}mm`,
    overflow: "hidden",
  };

  // Placeholder for a cell skipped by startOffset on a part-used sheet.
  if (!label) return <div className="label-cell" style={box} aria-hidden />;

  const guides = profile.guides
    ? "border border-dashed border-gray-300"
    : "border-0";

  // Jewellery dies: content is confined to the printable windows and hard
  // clipped, so nothing bleeds onto the tail that wraps the ring shank.
  if (profile.printableWindows?.length) {
    return (
      <div className={`label-cell relative ${guides}`} style={box}>
        {profile.printableWindows.map((w: PrintableWindow, i: number) => (
          <div
            key={i}
            className="absolute flex flex-col justify-center overflow-hidden"
            style={{
              left: `${w.xMm}mm`,
              top: `${w.yMm}mm`,
              width: `${w.wMm}mm`,
              height: `${w.hMm}mm`,
            }}
          >
            <LabelBody
              label={label}
              plan={plan}
              options={options}
              currency={currency}
              scale={typeScale(w.hMm * 2)}
              showBarcode={w.role === "barcode"}
              showInfo={w.role === "info"}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`label-cell flex flex-col justify-between overflow-hidden ${guides}`}
      style={{ ...box, padding: `${profile.paddingMm}mm` }}
    >
      <LabelBody
        label={label}
        plan={plan}
        options={options}
        currency={currency}
        scale={typeScale(profile.heightMm)}
        showBarcode
        showInfo
      />
    </div>
  );
}

export default function LabelsPrintPage() {
  const [searchParams] = useSearchParams();
  const variantIds = useMemo(
    () => (searchParams.get("variantIds") ?? "").split(",").filter(Boolean),
    [searchParams],
  );

  const labels = useQuery({
    queryKey: [...inventoryKeys.all, "label-data", variantIds],
    queryFn: () => inventoryService.labelData(variantIds),
    enabled: variantIds.length > 0,
  });

  const { data: org } = useCurrentOrg();
  const currency = org?.currency ?? "INR";

  const [options, setOptions] = useState<LabelOptions>(loadOptions);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      localStorage.setItem(OPTS_KEY, JSON.stringify(options));
    } catch {
      // storage unavailable — options just don't persist
    }
  }, [options]);

  // Default each variant's label count to its on-hand quantity (min 1) —
  // the "20 units → 20 identical labels" flow.
  useEffect(() => {
    if (!labels.data) return;
    setQuantities((prev) => {
      const next = { ...prev };
      for (const l of labels.data) {
        if (next[l.variantId] === undefined) {
          next[l.variantId] = Math.max(1, Math.min(l.defaultQty, MAX_QTY_PER_VARIANT));
        }
      }
      return next;
    });
  }, [labels.data]);

  const profile = useMemo(
    () => resolveProfile({ presetId: options.presetId, custom: options.custom }),
    [options.presetId, options.custom],
  );

  const isSheet = profile.kind === "sheet";

  // One plan per VARIANT, not per printed copy — at most 200 distinct codes
  // against up to 1000 labels.
  const plans = useMemo(() => {
    const map = new Map<string, BarcodePlan>();
    const minBar = profile.printableWindows ? MIN_BAR_HEIGHT_SMALL_MM : MIN_BAR_HEIGHT_MM;
    for (const l of labels.data ?? []) {
      if (!l.barcode) continue;
      const inWindow = Boolean(profile.printableWindows);
      const sym = detectSymbology(l.barcode).symbology;
      const scale = typeScale(inWindow ? profile.contentHeightMm * 2 : profile.heightMm);
      const rows = textRowCount(options, sym, inWindow);
      const textMm = rows * 2.6 * scale;
      map.set(
        l.variantId,
        planBarcode({
          value: l.barcode,
          availableMm: profile.contentWidthMm,
          dpi: options.dpi,
          preferDots: options.preferDots,
          maxBarHeightMm: Math.max(1, profile.contentHeightMm - textMm),
          minBarHeightMm: minBar,
          thermal: profile.kind === "roll",
        }),
      );
    }
    return map;
  }, [labels.data, profile, options]);

  const rows = labels.data ?? [];
  const missingBarcode = rows.filter((l) => !l.barcode);
  const unfit = rows.filter(
    (l) => l.barcode && plans.get(l.variantId)?.quality === "unfit",
  );
  const warned = rows.filter((l) => {
    const p = plans.get(l.variantId);
    return Boolean(l.barcode && p && p.quality !== "unfit" && p.notice);
  });

  const printable = useMemo(() => {
    const out: LabelData[] = [];
    for (const l of rows) {
      if (!l.barcode) continue;
      const plan = plans.get(l.variantId);
      if (!plan || plan.quality === "unfit") continue; // listed below instead
      const qty = quantities[l.variantId] ?? 1;
      for (let i = 0; i < qty && out.length < MAX_LABELS; i++) out.push(l);
    }
    return out;
  }, [rows, plans, quantities]);

  // What the merchant asked for, so truncation can be stated rather than silent.
  const requested = rows.reduce((n, l) => {
    if (!l.barcode) return n;
    const plan = plans.get(l.variantId);
    if (!plan || plan.quality === "unfit") return n;
    return n + (quantities[l.variantId] ?? 1);
  }, 0);
  const truncated = Math.max(0, requested - printable.length);

  const pages = useMemo(
    () => chunkPages(printable, profile.perPage, isSheet ? options.startOffset : 0),
    [printable, profile.perPage, isSheet, options.startOffset],
  );

  const toggle = (key: "showSku" | "showTitle" | "showPrice" | "showHri") =>
    setOptions((o) => ({ ...o, [key]: !o[key] }));

  const setCustom = (patch: Partial<CustomStock>) =>
    setOptions((o) => ({ ...o, custom: { ...o.custom, ...patch } }));

  const onPresetChange = (id: string) => {
    const preset = findPreset(id);
    setOptions((o) => ({
      ...o,
      presetId: id,
      // Rolls are 203 dpi thermal, A4 goes through a 600 dpi laser. Follow the
      // stock by default; the merchant can override afterwards.
      dpi: preset?.defaultDpi ?? o.dpi,
      startOffset: 0,
    }));
  };

  // Offer dot counts by the module width they actually produce, not fixed
  // numbers: 2 dots is 0.25 mm at 203 dpi but only 0.08 mm at 600, which is far
  // below any scannable width.
  const dotOptions = useMemo(() => {
    const pitch = dotPitchMm(options.dpi);
    const seen = new Set<number>();
    return [0.25, 0.33, 0.5]
      .map((targetMm) => Math.max(1, Math.round(targetMm / pitch)))
      .filter((k) => (seen.has(k) ? false : (seen.add(k), true)))
      .map((k) => ({ k, mm: (k * pitch).toFixed(3) }));
  }, [options.dpi]);

  if (variantIds.length === 0) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        No variants selected. Open this page from the Inventory screen with rows selected.
      </div>
    );
  }

  const inputCls = "rounded-md border px-2 py-1 text-xs";
  const numCls = "w-16 rounded-md border px-2 py-1 text-xs";

  return (
    <div className="min-h-screen bg-white">
      <style>{`
        @media print {
          ${buildPageCss(profile)}
          body { background: white !important; }

          /* Whitelist, not blacklist.
             Hiding only .no-print assumes every stray node carries the tag, so
             anything this app does not create still prints — portals, and
             nodes injected by browser extensions, which is where the graphics
             landing on top of the barcodes come from. This route's markup has
             never contained an <img> in any commit, and the label API returns
             no image field, so there is no element here to remove.

             visibility (not display) for the hide step: it is overridable on
             descendants, so the sheet re-shows even though its ancestors stay
             hidden — display:none would take the sheet with everything else
             and no descendant rule could bring it back. It also leaves the
             labels' boxes and page breaks untouched, which roll mode depends
             on for exactly one die-cut row per page. */
          body * { visibility: hidden !important; }
          .label-sheet, .label-sheet * { visibility: visible !important; }

          /* The toolbars must occupy NO space; visibility alone would leave a
             gap above the first label. */
          .no-print { display: none !important; }

          .label-page { box-shadow: none !important; margin: 0 !important; }
        }
        .label-cell { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      `}</style>

      {/* Row 1 — content and print */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b bg-gray-50 px-6 py-3 text-xs">
        <span className="font-semibold text-gray-900">
          {truncated > 0
            ? `${printable.length.toLocaleString()} of ${requested.toLocaleString()} labels`
            : `${printable.length} label${printable.length === 1 ? "" : "s"}`}
        </span>
        {(["showSku", "showTitle", "showPrice", "showHri"] as const).map((key) => (
          <label key={key} className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={options[key]} onChange={() => toggle(key)} />
            {key === "showSku"
              ? "SKU text"
              : key === "showTitle"
                ? "Product title"
                : key === "showPrice"
                  ? "Price"
                  : "Digits under EAN"}
          </label>
        ))}
        {truncated > 0 && (
          <span className="text-amber-700">
            Printing the first {MAX_LABELS.toLocaleString()} of{" "}
            {requested.toLocaleString()} — reduce quantities or print in two batches.
          </span>
        )}
        <Button
          variant="brand"
          size="action"
          className="ml-auto"
          onClick={() => window.print()}
          disabled={printable.length === 0}
        >
          <Printer className="size-3.5" /> Print
        </Button>
      </div>

      {/* Row 2 — stock, layout and printer */}
      <div className="no-print flex flex-wrap items-center gap-4 border-b bg-white px-6 py-3 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="font-medium text-gray-700">Stock</span>
          <select
            value={options.presetId}
            onChange={(e) => onPresetChange(e.target.value)}
            className={inputCls}
          >
            <optgroup label="Label rolls">
              {LABEL_PRESETS.filter((p) => p.group === "primary").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="More sizes">
              {LABEL_PRESETS.filter((p) => p.group === "more").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Jewellery">
              {LABEL_PRESETS.filter((p) => p.group === "jewellery").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="A4 sheets">
              {LABEL_PRESETS.filter((p) => p.group === "sheet").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Custom">
              <option value={CUSTOM_PRESET_ID}>Custom size…</option>
            </optgroup>
          </select>
        </label>

        {options.presetId === CUSTOM_PRESET_ID && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-gray-50 px-2 py-1">
            <select
              value={options.custom.kind}
              onChange={(e) => setCustom({ kind: e.target.value as "roll" | "sheet" })}
              className={inputCls}
            >
              <option value="roll">Roll</option>
              <option value="sheet">A4 sheet</option>
            </select>
            {(
              [
                ["Width", "widthMm"],
                ["Height", "heightMm"],
                ["Gap", "gapXMm"],
                ["Columns", "across"],
              ] as const
            ).map(([labelText, key]) => (
              <label key={key} className="flex items-center gap-1">
                <span className="text-gray-600">{labelText}</span>
                <input
                  type="number"
                  min={0}
                  step={key === "across" ? 1 : 0.5}
                  value={options.custom[key]}
                  onChange={(e) => setCustom({ [key]: Number(e.target.value) || 0 })}
                  className={numCls}
                />
              </label>
            ))}
            {options.custom.kind === "sheet" && (
              <label className="flex items-center gap-1">
                <span className="text-gray-600">Rows</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={options.custom.down}
                  onChange={(e) => setCustom({ down: Number(e.target.value) || 1 })}
                  className={numCls}
                />
              </label>
            )}
          </div>
        )}

        <label className="flex items-center gap-1.5">
          <span className="font-medium text-gray-700">Printer</span>
          <select
            value={options.dpi}
            onChange={(e) => setOptions((o) => ({ ...o, dpi: Number(e.target.value) }))}
            className={inputCls}
          >
            <option value={203}>203 dpi</option>
            <option value={300}>300 dpi</option>
            <option value={600}>600 dpi</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <span className="font-medium text-gray-700">Bar width</span>
          <select
            value={String(options.preferDots)}
            onChange={(e) =>
              setOptions((o) => ({
                ...o,
                preferDots: e.target.value === "auto" ? "auto" : Number(e.target.value),
              }))
            }
            className={inputCls}
          >
            <option value="auto">Auto</option>
            {dotOptions.map(({ k, mm }) => (
              <option key={k} value={k}>
                {k} dots ({mm} mm)
              </option>
            ))}
          </select>
        </label>

        {isSheet && (
          <>
            <label className="flex items-center gap-1.5">
              <span className="font-medium text-gray-700">Skip first</span>
              <input
                type="number"
                min={0}
                max={Math.max(0, profile.perPage - 1)}
                value={options.startOffset}
                onChange={(e) =>
                  setOptions((o) => ({
                    ...o,
                    startOffset: Math.max(
                      0,
                      Math.min(profile.perPage - 1, Number(e.target.value) || 0),
                    ),
                  }))
                }
                className={numCls}
              />
            </label>
            {(
              [
                ["Nudge X", "nudgeXMm"],
                ["Nudge Y", "nudgeYMm"],
              ] as const
            ).map(([labelText, key]) => (
              <label key={key} className="flex items-center gap-1.5">
                <span className="font-medium text-gray-700">{labelText}</span>
                <input
                  type="number"
                  min={-5}
                  max={5}
                  step={0.5}
                  value={options[key]}
                  onChange={(e) =>
                    setOptions((o) => ({
                      ...o,
                      [key]: Math.max(-5, Math.min(5, Number(e.target.value) || 0)),
                    }))
                  }
                  className={numCls}
                />
              </label>
            ))}
          </>
        )}

        <span className="text-muted-foreground">
          {profile.hint ??
            (isSheet
              ? "Print at 100% scale with margins set to None. Test on plain paper before using sticker sheets."
              : `Set the printer's paper size to ${profile.pageWidthMm} × ${profile.pageHeightMm} mm, scale 100%, margins none. Chrome or Edge.`)}
        </span>
      </div>

      {/* Per-variant quantity editor */}
      <div className="no-print border-b px-6 py-3">
        {labels.isLoading && <p className="text-xs text-muted-foreground">Loading label data…</p>}
        {labels.isError && (
          <p className="text-xs text-red-600">Couldn't load label data — refresh to retry.</p>
        )}
        <div className="flex flex-wrap gap-4">
          {rows.map((l) => {
            const plan = plans.get(l.variantId);
            const isUnfit = Boolean(l.barcode) && plan?.quality === "unfit";
            return (
              <label key={l.variantId} className="flex items-center gap-2 text-xs">
                <span className="max-w-48 truncate font-medium">
                  {l.productTitle}
                  {l.variantTitle !== "Default Title" ? ` — ${l.variantTitle}` : ""}
                </span>
                {!l.barcode ? (
                  <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] text-orange-700">
                    no barcode — generate first
                  </span>
                ) : isUnfit ? (
                  <span
                    className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] text-red-700"
                    title={fitRemedy({
                      plan: plan!,
                      profile,
                      value: l.barcode,
                    })}
                  >
                    doesn't fit {profile.widthMm} × {profile.heightMm} mm
                  </span>
                ) : (
                  <>
                    <input
                      type="number"
                      min={0}
                      max={MAX_QTY_PER_VARIANT}
                      value={quantities[l.variantId] ?? 1}
                      onChange={(e) =>
                        setQuantities((q) => ({
                          ...q,
                          [l.variantId]: Math.max(
                            0,
                            Math.min(MAX_QTY_PER_VARIANT, parseInt(e.target.value, 10) || 0),
                          ),
                        }))
                      }
                      className="w-16 rounded-md border px-2 py-1"
                    />
                    {plan?.notice && (
                      <span
                        className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800"
                        title={plan.notice}
                      >
                        check scan
                      </span>
                    )}
                  </>
                )}
              </label>
            );
          })}
        </div>
        {missingBarcode.length > 0 && (
          <p className="mt-2 text-[11px] text-orange-700">
            {missingBarcode.length} variant{missingBarcode.length === 1 ? " has" : "s have"} no
            barcode and will be skipped. Generate barcodes from the Inventory screen first.
          </p>
        )}
        {unfit.length > 0 && (
          <p className="mt-2 text-[11px] text-red-700">
            {unfit.length} variant{unfit.length === 1 ? " doesn't" : "s don't"} fit{" "}
            {profile.widthMm} × {profile.heightMm} mm and will be skipped.{" "}
            {fitRemedy({
              plan: plans.get(unfit[0]!.variantId)!,
              profile,
              value: unfit[0]!.barcode!,
            })}
          </p>
        )}
        {warned.length > 0 && (
          <p className="mt-2 text-[11px] text-amber-800">
            {warned.length} label{warned.length === 1 ? "" : "s"} print below the recommended bar
            width or magnification — test-scan one before running the batch.
          </p>
        )}
      </div>

      {/* Pages. Each .label-page is one physical page: an A4 sheet, or one
          die-cut row on a roll. Geometry is inline because it must be the same
          number on screen and on paper. */}
      <div className="label-sheet">
        {pages.map((page, pi) => (
          <div
            key={pi}
            className="label-page mx-auto mb-4 bg-white shadow-sm print:shadow-none"
            style={{
              width: `${profile.pageWidthMm}mm`,
              height: `${profile.pageHeightMm}mm`,
              paddingTop: `${profile.marginTopMm + options.nudgeYMm}mm`,
              paddingLeft: `${profile.marginLeftMm + options.nudgeXMm}mm`,
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            <div
              className="label-grid"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${profile.across}, ${profile.widthMm}mm)`,
                gridAutoRows: `${profile.heightMm}mm`,
                columnGap: `${profile.gapXMm}mm`,
                rowGap: `${profile.gapYMm}mm`,
              }}
            >
              {page.map((l, ci) => (
                <LabelCell
                  key={`${pi}-${ci}`}
                  label={l}
                  plan={l ? plans.get(l.variantId) : undefined}
                  options={options}
                  profile={profile}
                  currency={currency}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
