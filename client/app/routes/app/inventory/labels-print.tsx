import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import JsBarcode from "jsbarcode";
import { Printer } from "lucide-react";
import { inventoryService } from "~/services/inventory.service";
import { inventoryKeys } from "~/hooks/use-inventory-queries";
import type { LabelData } from "~/types/api";

/**
 * Barcode label print sheet — 50×25 mm per label, Code 128 SVG (crisp on
 * 203 dpi thermal printers; pure black, no grayscale antialiasing).
 *
 * Rendered chrome-free: the route ends in `/print`, which the app layout's
 * existing regex treats like packing-slip/pick-slip. Options persist in
 * localStorage (same pattern as order-slip.tsx). Print via the button — the
 * OS printer's paper size must be set to 50×25 mm for @page to take effect
 * (thermal drivers ignore CSS sizes that don't match the driver paper).
 */

const OPTS_KEY = "label-print-opts";
const MAX_LABELS = 1000;

interface LabelOptions {
  showSku: boolean;
  showTitle: boolean;
  showPrice: boolean;
}

const DEFAULT_OPTIONS: LabelOptions = { showSku: true, showTitle: true, showPrice: false };

function loadOptions(): LabelOptions {
  if (typeof window === "undefined") return DEFAULT_OPTIONS;
  try {
    return { ...DEFAULT_OPTIONS, ...JSON.parse(localStorage.getItem(OPTS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

function BarcodeSvg({ code }: { code: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, code, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 40,
        width: 1.6,
        background: "transparent",
        lineColor: "#000000",
      });
    } catch {
      // Invalid code — leave the SVG empty; the label still shows the text.
    }
  }, [code]);
  return <svg ref={ref} className="h-[9mm] w-full" preserveAspectRatio="none" />;
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
          next[l.variantId] = Math.max(1, Math.min(l.defaultQty, 100));
        }
      }
      return next;
    });
  }, [labels.data]);

  const printable = useMemo(() => {
    const out: LabelData[] = [];
    for (const l of labels.data ?? []) {
      if (!l.barcode) continue; // nothing scannable — skip, listed below
      const qty = quantities[l.variantId] ?? 1;
      for (let i = 0; i < qty && out.length < MAX_LABELS; i++) out.push(l);
    }
    return out;
  }, [labels.data, quantities]);

  const missingBarcode = (labels.data ?? []).filter((l) => !l.barcode);

  const toggle = (key: keyof LabelOptions) =>
    setOptions((o) => ({ ...o, [key]: !o[key] }));

  if (variantIds.length === 0) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        No variants selected. Open this page from the Inventory screen with rows selected.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <style>{`
        @media print {
          @page { size: 50mm 25mm; margin: 0; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .label-cell { page-break-after: always; break-after: page; }
          .label-cell:last-child { page-break-after: auto; break-after: auto; }
        }
        .label-cell { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      `}</style>

      {/* Options bar */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b bg-gray-50 px-6 py-3 text-xs">
        <span className="font-semibold text-gray-900">
          {printable.length} label{printable.length === 1 ? "" : "s"}
        </span>
        {(["showSku", "showTitle", "showPrice"] as const).map((key) => (
          <label key={key} className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={options[key]} onChange={() => toggle(key)} />
            {key === "showSku" ? "SKU text" : key === "showTitle" ? "Product title" : "Price"}
          </label>
        ))}
        <span className="text-muted-foreground">
          Set printer paper to 50×25&nbsp;mm. Use Chrome/Edge for custom label sizes.
        </span>
        <button
          onClick={() => window.print()}
          disabled={printable.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#CEF17B] px-4 py-2 font-semibold text-gray-900 hover:bg-[#b8e67d] disabled:opacity-50"
        >
          <Printer className="size-3.5" /> Print
        </button>
      </div>

      {/* Per-variant quantity editor */}
      <div className="no-print border-b px-6 py-3">
        {labels.isLoading && <p className="text-xs text-muted-foreground">Loading label data…</p>}
        {labels.isError && (
          <p className="text-xs text-red-600">Couldn't load label data — refresh to retry.</p>
        )}
        <div className="flex flex-wrap gap-4">
          {(labels.data ?? []).map((l) => (
            <label key={l.variantId} className="flex items-center gap-2 text-xs">
              <span className="max-w-48 truncate font-medium">
                {l.productTitle}
                {l.variantTitle !== "Default Title" ? ` — ${l.variantTitle}` : ""}
              </span>
              {l.barcode ? (
                <input
                  type="number"
                  min={0}
                  max={MAX_LABELS}
                  value={quantities[l.variantId] ?? 1}
                  onChange={(e) =>
                    setQuantities((q) => ({
                      ...q,
                      [l.variantId]: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-16 rounded-md border px-2 py-1"
                />
              ) : (
                <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] text-orange-700">
                  no barcode — generate first
                </span>
              )}
            </label>
          ))}
        </div>
        {missingBarcode.length > 0 && (
          <p className="mt-2 text-[11px] text-orange-700">
            {missingBarcode.length} variant{missingBarcode.length === 1 ? " has" : "s have"} no
            barcode and will be skipped. Generate barcodes from the Inventory screen first.
          </p>
        )}
      </div>

      {/* Labels — one 50×25mm cell per physical unit */}
      <div className="flex flex-wrap gap-2 p-4 print:block print:gap-0 print:p-0">
        {printable.map((l, i) => (
          <div
            key={`${l.variantId}-${i}`}
            className="label-cell flex h-[25mm] w-[50mm] flex-col justify-between overflow-hidden border border-dashed border-gray-300 px-[2mm] py-[1.5mm] print:border-0"
          >
            {options.showTitle && (
              <p className="truncate text-[7pt] font-semibold leading-tight text-black">
                {l.productTitle}
                {l.variantTitle !== "Default Title" ? ` · ${l.variantTitle}` : ""}
              </p>
            )}
            <BarcodeSvg code={l.barcode!} />
            <div className="flex items-baseline justify-between gap-1">
              {options.showSku && (
                <p className="truncate font-mono text-[6.5pt] leading-tight text-black">
                  {l.sku ?? l.barcode}
                </p>
              )}
              {options.showPrice && (
                <p className="shrink-0 text-[7pt] font-bold leading-tight text-black">
                  ₹{Number(l.price).toFixed(0)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
