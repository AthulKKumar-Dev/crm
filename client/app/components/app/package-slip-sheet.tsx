import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Package, RefreshCw } from "lucide-react";
import {
  PrintAction,
  PrintSettingsCard,
  PrintWarnings,
  type LabelWarning,
} from "~/components/app/labels/print-summary-card";
import type { PackageSlipStore, SlipZone } from "~/components/app/package-slip";
import { PrintStatusPanel } from "~/components/app/print-status-panel";
import { SegmentedTabs } from "~/components/app/segmented-tabs";
import { SlipContentOptions } from "~/components/app/slips/slip-content-options";
import { SlipCustomFields } from "~/components/app/slips/slip-custom-fields";
import { SlipLayoutPicker } from "~/components/app/slips/slip-layout-picker";
import { SlipOrderRows } from "~/components/app/slips/slip-order-rows";
import {
  SlipPagePreview,
  type SlipPreviewView,
} from "~/components/app/slips/slip-page-preview";
import { SlipFamilyTabs, SlipPaperGrid } from "~/components/app/slips/slip-paper-picker";
import { SlipPrintStyles } from "~/components/app/slips/slip-print-styles";
import { SlipSheet } from "~/components/app/slips/slip-sheet";
import { SlipStoreDetails } from "~/components/app/slips/slip-store-details";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { readAddress } from "~/lib/address";
import { chunkPages, type CustomStock } from "~/lib/label-stock";
import {
  CUSTOM_PAPER_ID,
  EMPTY_OVERRIDES,
  loadSlipOptions,
  saveSlipOptions,
  type SlipSheetOptions,
  type SlipStoreOverrides,
} from "~/lib/slip-options";
import {
  SLIP_FAMILIES,
  findSlipPaper,
  resolveSlipProfile,
  slipPapersInGroup,
  slipScale,
  slipTooSmall,
  type SlipFamily,
  type SlipLayout,
} from "~/lib/slip-stock";
import type { OrderSlipData } from "~/types/api";

/**
 * The package-slip editor: controls on the left, a live scaled preview and the
 * consequences on the right. Owns the paper choice, the layout, the paging and
 * the warnings; `PackageSlip` owns the artwork.
 *
 * Both print routes render this, which is the point: the per-order slip and a
 * 4-up batch differ only in how many orders they are handed.
 *
 * The **print DOM is separate from the preview** — `<SlipSheet>` holds every
 * page at full size, parked off-screen, while the rail renders the same
 * `<SlipPage>` under a transform. Read the header of `slip-print-styles.tsx`
 * before touching either.
 *
 * `<SlipSheet>` MUST stay a direct child of this component's root. No ancestor
 * may carry padding, overflow, max-height or transform.
 */

export type SlipEditorStatus = "empty" | "loading" | "error" | "ready";

const VIEW_ITEMS: Array<{ value: SlipPreviewView; label: string }> = [
  { value: "sheet", label: "Whole sheet" },
  { value: "slip", label: "One slip" },
];

function familyOf(paperId: string): SlipFamily {
  if (paperId === CUSTOM_PAPER_ID) return "custom";
  return findSlipPaper(paperId)?.group ?? "office";
}

export function PackageSlipSheet({
  orders,
  store,
  mode,
  status,
  onRetry,
  requestedCount,
  storageKey,
  defaultPaperId,
  defaultLayout,
  backTo,
  backLabel = "Back",
}: {
  /** Empty until `status` is "ready". */
  orders: OrderSlipData[];
  store: PackageSlipStore;
  /** "batch" adds the order checklist; otherwise the two are the same screen. */
  mode: "batch" | "single";
  status: SlipEditorStatus;
  onRetry?: () => void;
  /** How many orders the URL asked for, so a short answer can be stated. */
  requestedCount?: number;
  /** Separate per route: printing one parcel and printing the day's batch are
   *  different jobs and merchants pick different paper for each. */
  storageKey: string;
  defaultPaperId: string;
  defaultLayout: SlipLayout;
  backTo: string;
  backLabel?: string;
}) {
  const isBatch = mode === "batch";

  const [options, setOptions] = useState<SlipSheetOptions>(() =>
    loadSlipOptions(storageKey, defaultPaperId, defaultLayout),
  );

  // View state, deliberately outside SlipSheetOptions — that record stays a
  // description of what gets printed and nothing else.
  const [family, setFamily] = useState<SlipFamily>(() => familyOf(options.paperId));
  const [showAll, setShowAll] = useState<boolean>(() => {
    // Never hide the selected card behind a disclosure.
    const paper = findSlipPaper(options.paperId);
    return Boolean(paper && !paper.common);
  });
  const [storeOpen, setStoreOpen] = useState(false);
  const [hover, setHover] = useState<SlipZone | null>(null);
  const [view, setView] = useState<SlipPreviewView>("sheet");
  const [previewIndex, setPreviewIndex] = useState(0);
  // Unticked rather than ticked: every order starts in, whenever it arrives.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => saveSlipOptions(storageKey, options), [options, storageKey]);

  const set = (patch: Partial<SlipSheetOptions>) => {
    setOptions((o) => ({ ...o, ...patch }));
    setPreviewIndex(0);
  };
  const setCustom = (patch: Partial<CustomStock>) =>
    setOptions((o) => ({ ...o, custom: { ...o.custom, ...patch } }));
  const setOverride = (patch: Partial<SlipStoreOverrides>) =>
    setOptions((o) => ({ ...o, overrides: { ...o.overrides, ...patch } }));

  const selectFamily = (next: SlipFamily) => {
    setFamily(next);
    setShowAll(false);
    if (next === "custom") {
      set({ paperId: CUSTOM_PAPER_ID });
      return;
    }
    const list = slipPapersInGroup(next);
    const pick = list.find((p) => p.recommended) ?? list[0];
    // Keep the layout unless it is unreadable on the paper the pill lands on —
    // 4-up carried from A4 onto a 4 × 6 card or a label roll would open the
    // family on a warning nobody asked for.
    const layout =
      ([options.layout, 2, 1] as SlipLayout[]).find(
        (l) =>
          l <= options.layout &&
          !slipTooSmall(
            resolveSlipProfile({ paperId: pick.id, layout: l, custom: options.custom }),
          ),
      ) ?? 1;
    set({ paperId: pick.id, layout });
  };

  const toggleOrder = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const isCustom = options.paperId === CUSTOM_PAPER_ID;
  const paper = isCustom ? undefined : findSlipPaper(options.paperId);
  const isThermal = paper?.group === "thermal";

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

  const printing = useMemo(
    () => (isBatch ? orders.filter((o) => !excluded.has(o.id)) : orders),
    [orders, excluded, isBatch],
  );
  const pages = useMemo(
    () => chunkPages(printing, profile.perPage, 0),
    [printing, profile.perPage],
  );
  const pageIndex = Math.min(previewIndex, Math.max(0, pages.length - 1));

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

  // ── warnings ─────────────────────────────────────────────────────────────
  const warnings: LabelWarning[] = [];
  const each = `${profile.widthMm.toFixed(0)} × ${profile.heightMm.toFixed(0)} mm`;

  if (slipTooSmall(profile)) {
    // The most slips per sheet that still read — not merely one step down,
    // which on A6 would trade one warning for the same warning.
    const fewer: SlipLayout | null = isCustom
      ? null
      : (([2, 1] as SlipLayout[]).find(
          (l) =>
            l < options.layout &&
            !slipTooSmall(
              resolveSlipProfile({ paperId: options.paperId, layout: l, custom: options.custom }),
            ),
        ) ?? null);
    warnings.push({
      id: "too-small",
      tone: "danger",
      title: "Each slip is too small to read",
      body: `At ${each} per slip the text drops below a readable size and long addresses get cut off. Use fewer slips per sheet or a larger paper.`,
      action: fewer
        ? { label: `Switch to ${fewer} per sheet`, onClick: () => set({ layout: fewer }) }
        : undefined,
    });
  }

  const noAddress = printing.filter((o) => !readAddress(o.shippingAddress).hasAddress);
  if (noAddress.length > 0) {
    const names = noAddress.map((o) => o.name).join(", ");
    warnings.push({
      id: "no-address",
      tone: "warning",
      title:
        noAddress.length === 1
          ? "1 order has no shipping address"
          : `${noAddress.length} orders have no shipping address`,
      body: isBatch
        ? `${names} will print with an empty To block. Add the address on the order first, or untick it from this batch.`
        : `${names} will print with an empty To block. Add the address on the order first.`,
      action: isBatch
        ? {
            label: noAddress.length === 1 ? "Leave it out of this batch" : "Leave them out of this batch",
            onClick: () =>
              setExcluded((prev) => new Set([...prev, ...noAddress.map((o) => o.id)])),
          }
        : undefined,
    });
  }

  if (isThermal && profile.perPage > 1) {
    warnings.push({
      id: "thermal-n-up",
      tone: "warning",
      title: "Thermal rolls usually print one slip at a time",
      body: "Splitting a 100 mm roll label makes each slip very small. 1 per sheet is recommended here.",
      action: { label: "Use 1 per sheet", onClick: () => set({ layout: 1 }) },
    });
  }

  // The server caps a batch and drops ids it cannot read; say so rather than
  // let a short run look like the whole selection.
  if (requestedCount !== undefined && status === "ready" && orders.length < requestedCount) {
    warnings.push({
      id: "short",
      tone: "info",
      title: `${orders.length} of ${requestedCount} orders loaded`,
      body: "The rest could not be loaded for this print. Print these, then select the remaining orders and print again.",
    });
  }

  // ── copy ─────────────────────────────────────────────────────────────────
  const total = printing.length;
  const paperName = paper?.name ?? `Custom ${profile.pageWidthMm} × ${profile.pageHeightMm} mm`;
  const caption = `${paperName} · ${profile.perPage} per sheet${
    profile.perPage > 1 ? ` · ${each} each` : ""
  }`;
  const readyNote =
    total === 0
      ? isBatch
        ? "No orders selected."
        : "Nothing to print yet."
      : `${total} slip${total === 1 ? "" : "s"} ready · ${pages.length} sheet${
          pages.length === 1 ? "" : "s"
        } of paper`;

  const printSettings = [
    {
      key: "Paper size",
      value:
        paper && !isThermal
          ? `${paper.name} (${paper.widthMm} × ${paper.heightMm} mm)`
          : `${profile.pageWidthMm} × ${profile.pageHeightMm} mm`,
    },
    { key: "Scale", value: "Actual size — not “Fit to page”" },
    { key: "Printer layout", value: "1 page per sheet" },
    isThermal
      ? { key: "Printer", value: "Your label printer" }
      : { key: "Media type", value: "Plain paper" },
  ];
  const printerNote =
    profile.perPage > 1
      ? `The ${profile.perPage} slips are already arranged on the sheet. If your printer also has a “pages per sheet” option, leave it at 1 or you'll get ${
          profile.perPage * profile.perPage
        } tiny slips.`
      : "Set these in the print dialog your browser opens next.";

  const familyPapers = family === "custom" ? [] : slipPapersInGroup(family);
  const shownPapers = showAll ? familyPapers : familyPapers.filter((p) => p.common);
  const familyHint = SLIP_FAMILIES.find((f) => f.id === family)?.hint;

  const title = isBatch ? "Print package slips" : "Print package slip";
  const subtitle = isBatch
    ? "Choose your paper, check each slip, and print the whole batch at once."
    : orders[0]
      ? `Order ${orders[0].name} · choose your paper and print when it looks right.`
      : "Choose your paper and print when it looks right.";

  const backButton = (variant: "outline" | "accent") => (
    <Button asChild variant={variant} size="sm">
      <Link to={backTo}>
        <ArrowLeft className="size-3.5" />
        {backLabel}
      </Link>
    </Button>
  );

  return (
    <div className="min-h-screen bg-surface-sunken">
      <SlipPrintStyles profile={profile} />

      <div className="no-print mx-auto w-full max-w-screen-xl p-4 lg:p-6">
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h1 className="font-heading text-subhead text-foreground">{title}</h1>
              <p className="mt-0.5 text-body text-muted-foreground">{subtitle}</p>
            </div>
            <div className="flex flex-none items-center gap-3">
              <span className="hidden text-caption text-muted-foreground sm:inline">
                Settings saved on this device
              </span>
              {backButton("outline")}
            </div>
          </header>

          {status === "empty" && (
            <PrintStatusPanel
              icon={Package}
              title="No orders selected"
              body="Go back to Orders, tick the orders you want slips for, then choose Print package slips."
            >
              {backButton("accent")}
            </PrintStatusPanel>
          )}

          {status === "error" && (
            <PrintStatusPanel
              icon={Package}
              title={isBatch ? "We couldn't load these orders" : "We couldn't load this order"}
              body="Nothing was printed. Try again — your slip settings are saved."
            >
              {onRetry && (
                <Button variant="accent" size="sm" onClick={onRetry}>
                  <RefreshCw className="size-3.5" />
                  Try again
                </Button>
              )}
              {backButton("outline")}
            </PrintStatusPanel>
          )}

          {status === "loading" && (
            <div className="grid place-items-center gap-3 px-6 py-24 text-center">
              <Skeleton className="h-40 w-28 rounded-sm" />
              <p className="text-section text-foreground">
                Preparing your slip{isBatch ? "s" : ""}…
              </p>
              <p className="text-body text-muted-foreground">
                Loading order and store details.
              </p>
            </div>
          )}

          {status === "ready" && (
            <div className="grid grid-cols-1 items-start lg:grid-cols-[minmax(0,1fr)_26.5rem]">
              {/* ── controls ─────────────────────────────────────────────── */}
              <div className="min-w-0 space-y-6 px-5 py-5">
                <section className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h2 className="text-section text-foreground">
                      What paper are you printing on?
                    </h2>
                    <span className="text-caption text-muted-foreground">{familyHint}</span>
                  </div>

                  <SlipFamilyTabs value={family} onChange={selectFamily} />

                  {family === "custom" ? (
                    <SlipCustomFields custom={options.custom} onChange={setCustom} />
                  ) : (
                    <SlipPaperGrid
                      papers={shownPapers}
                      hiddenCount={familyPapers.length - shownPapers.length}
                      showAll={showAll}
                      onShowAllChange={setShowAll}
                      value={options.paperId}
                      onSelect={(paperId) => set({ paperId })}
                    />
                  )}
                </section>

                {!isCustom && (
                  <section className="space-y-2">
                    <h2 className="text-section text-foreground">How many slips per sheet?</h2>
                    <p className="text-caption text-muted-foreground">
                      {isBatch
                        ? "Printing several to a sheet saves paper — you cut along the dashed guides."
                        : "For one parcel, a whole sheet is simplest."}
                    </p>
                    <SlipLayoutPicker
                      paperId={options.paperId}
                      custom={options.custom}
                      value={options.layout}
                      onSelect={(layout) => set({ layout })}
                    />
                  </section>
                )}

                <section className="space-y-2">
                  <h2 className="text-section text-foreground">What should the slip include?</h2>
                  <p className="text-caption text-muted-foreground">
                    Hover a row to see where it sits on the slip.
                  </p>
                  <SlipContentOptions
                    showBarcodeZone={options.showBarcodeZone}
                    showItems={options.showItems}
                    onToggle={(zone) =>
                      setOptions((o) =>
                        zone === "barcode"
                          ? { ...o, showBarcodeZone: !o.showBarcodeZone }
                          : { ...o, showItems: !o.showItems },
                      )
                    }
                    onHover={setHover}
                  />
                </section>

                <SlipStoreDetails
                  store={store}
                  effectiveStore={effectiveStore}
                  overrides={options.overrides}
                  onChange={setOverride}
                  onReset={() => set({ overrides: EMPTY_OVERRIDES })}
                  open={storeOpen}
                  onOpenChange={setStoreOpen}
                />

                {isBatch && (
                  <section className="space-y-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="text-section text-foreground">Orders in this batch</h2>
                      <span className="text-caption text-muted-foreground">
                        One slip per order
                      </span>
                    </div>
                    <SlipOrderRows orders={orders} excluded={excluded} onToggle={toggleOrder} />
                  </section>
                )}
              </div>

              {/* ── rail ─────────────────────────────────────────────────── */}
              <aside className="space-y-4 border-t border-border bg-muted/30 px-5 py-5 lg:border-l lg:border-t-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-section text-foreground">Live preview</h2>
                  {profile.perPage > 1 && (
                    <SegmentedTabs
                      ariaLabel="Preview"
                      behaviour="filter"
                      value={view}
                      onChange={setView}
                      items={VIEW_ITEMS}
                    />
                  )}
                </div>

                <SlipPagePreview
                  pages={pages.length > 0 ? pages : [[]]}
                  index={pageIndex}
                  onIndexChange={setPreviewIndex}
                  view={view}
                  caption={caption}
                  profile={profile}
                  store={effectiveStore}
                  scale={scale}
                  showBarcodeZone={options.showBarcodeZone}
                  showItems={options.showItems}
                  highlight={hover}
                />

                <PrintWarnings warnings={warnings} />
                <PrintSettingsCard settings={printSettings} note={printerNote} />
                <PrintAction
                  total={total}
                  readyNote={readyNote}
                  noun="slip"
                  onPrint={() => window.print()}
                />
              </aside>
            </div>
          )}
        </div>
      </div>

      {/*
        The print DOM. A DIRECT child of the root and a sibling of the editor
        above — nothing between it and <body> carries padding, overflow,
        max-height or transform. Parked off-screen by `@media screen` in
        SlipPrintStyles; the rail shows its own scaled copy of one page.
      */}
      {status === "ready" && (
        <SlipSheet
          pages={pages}
          profile={profile}
          store={effectiveStore}
          scale={scale}
          showBarcodeZone={options.showBarcodeZone}
          showItems={options.showItems}
        />
      )}
    </div>
  );
}
