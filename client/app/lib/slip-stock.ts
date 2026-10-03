/**
 * Package-slip paper sizes and layouts — pure, no React, no DOM.
 *
 * Modelled the way a printer driver models it, because that is the mental model
 * the person at the printer already has: pick a PAPER SIZE, then pick a LAYOUT
 * (1-up / 2-up / 4-up). Every combination is legal, so this is two short lists
 * instead of a long flat list of every pairing.
 *
 * The page geometry itself is resolved by `label-stock.ts`'s `resolveProfile`,
 * which already emits `@page { size: <W>mm <H>mm; margin: 0 }` and knows how to
 * tile a page — one engine for labels and slips, never two.
 *
 * ⚠️ The printer's OWN N-up must stay off (Epson calls it Layout → Borders).
 * Our N-up composes the sheet at exact millimetres; stacking the driver's on
 * top of it would tile an already-tiled page — 4-up twice is 16 slips.
 *
 * The design reference is a PORTRAIT 100 × 150 mm box, which is not arbitrary:
 * an A4 quadrant (A6, 105 × 148.5) and a 4×6" label are within 5 mm of it, so
 * ONE design serves the 4-up sheet, the A6 sheet and the thermal roll.
 * `slipScale` reports the ratio and the slip scales its own type. Never fork
 * the layout per size.
 */

import {
  type CustomStock,
  type LabelPreset,
  type ResolvedProfile,
  resolveProfile,
} from "./label-stock";

/** A physical sheet or label the slip can be printed on. */
export interface SlipPaper {
  id: string;
  label: string;
  /** Short name for the size card — "A4", "4 × 6 in". */
  name: string;
  widthMm: number;
  heightMm: number;
  group: SlipPaperGroup;
  /** The size as the box it came in states it, for inch-denominated stock. */
  inch?: string;
  /** Shown before "Show all sizes" is opened. */
  common?: boolean;
  /** One per group — where the group's pill lands. */
  recommended?: boolean;
}

export type SlipPaperGroup = "office" | "photo" | "thermal";

/** What the picker's pills switch between: a paper group, or hand-typed. */
export type SlipFamily = SlipPaperGroup | "custom";

/** Slips per sheet. Matches the 1 / 2 / 4-up every print driver offers. */
export type SlipLayout = 1 | 2 | 4;

export const SLIP_LAYOUTS: ReadonlyArray<{ value: SlipLayout; label: string }> = [
  { value: 1, label: "1 slip per sheet" },
  { value: 2, label: "2 per sheet (cut once)" },
  { value: 4, label: "4 per sheet (cut twice)" },
];

/**
 * The box the slip's typography is designed against. `slipScale` reports how
 * much bigger (or smaller) the chosen cell is, and every font size in
 * `package-slip.tsx` is multiplied by it.
 */
export const SLIP_REF_W_MM = 100;
export const SLIP_REF_H_MM = 150;

/**
 * Paper sizes, ordered by how often a merchant will reach for them.
 *
 * The office and photo groups are the Epson/Canon/HP paper list nearly
 * verbatim — inch sizes converted exactly (1 in = 25.4 mm), so 4 × 6 is
 * 101.6 × 152.4 and not a rounded 100 × 150. Envelopes are deliberately
 * omitted: a package slip on a DL envelope is not a thing.
 */
export const SLIP_PAPERS: SlipPaper[] = [
  // --- Office / plain paper -------------------------------------------------
  { id: "a4", name: "A4", label: "A4 — 210 × 297 mm", widthMm: 210, heightMm: 297, group: "office", common: true, recommended: true },
  { id: "letter", name: "Letter", inch: "8.5 × 11 in", label: "Letter — 8.5 × 11 in", widthMm: 215.9, heightMm: 279.4, group: "office", common: true },
  { id: "a5", name: "A5", label: "A5 — 148 × 210 mm", widthMm: 148, heightMm: 210, group: "office", common: true },
  { id: "a6", name: "A6", label: "A6 — 105 × 148 mm", widthMm: 105, heightMm: 148, group: "office", common: true },
  { id: "b5", name: "B5", label: "B5 — 182 × 257 mm", widthMm: 182, heightMm: 257, group: "office" },
  { id: "b6", name: "B6", label: "B6 — 128 × 182 mm", widthMm: 128, heightMm: 182, group: "office" },
  { id: "legal", name: "Legal", inch: "8.5 × 14 in", label: "Legal — 8.5 × 14 in", widthMm: 215.9, heightMm: 355.6, group: "office" },
  { id: "folio", name: "Folio", inch: "8.5 × 13 in", label: "Folio — 8.5 × 13 in", widthMm: 215.9, heightMm: 330.2, group: "office" },
  {
    id: "indian-legal",
    name: "Indian Legal",
    label: "Indian Legal — 215 × 345 mm",
    widthMm: 215,
    heightMm: 345,
    group: "office",
  },
  { id: "16k", name: "16K", label: "16K — 195 × 270 mm", widthMm: 195, heightMm: 270, group: "office" },

  // --- Photo / card stock ---------------------------------------------------
  {
    id: "4x6",
    name: "4 × 6 in",
    label: '4 × 6 in / 10 × 15 cm — 101.6 × 152.4 mm',
    widthMm: 101.6,
    heightMm: 152.4,
    group: "photo",
    common: true,
    recommended: true,
  },
  { id: "postcard", name: "Post Card", label: "Post Card — 100 × 148 mm", widthMm: 100, heightMm: 148, group: "photo", common: true },
  { id: "5x7", name: "5 × 7 in", label: "5 × 7 in — 127 × 178 mm", widthMm: 127, heightMm: 178, group: "photo", common: true },
  { id: "5x8", name: "5 × 8 in", label: "5 × 8 in — 127 × 203 mm", widthMm: 127, heightMm: 203, group: "photo" },
  { id: "8x10", name: "8 × 10 in", label: "8 × 10 in — 203 × 254 mm", widthMm: 203.2, heightMm: 254, group: "photo" },
  { id: "3.5x5", name: "3.5 × 5 in", label: "3.5 × 5 in — 89 × 127 mm", widthMm: 89, heightMm: 127, group: "photo" },
  { id: "16-9", name: "16:9 wide", label: "16:9 wide — 102 × 181 mm", widthMm: 102, heightMm: 181, group: "photo" },

  // --- Thermal label rolls --------------------------------------------------
  {
    id: "thermal-100x150",
    name: "100 × 150 mm",
    label: "Thermal 100 × 150 mm (4 × 6\")",
    widthMm: 100,
    heightMm: 150,
    group: "thermal",
    common: true,
    recommended: true,
  },
  { id: "thermal-100x100", name: "100 × 100 mm", label: "Thermal 100 × 100 mm", widthMm: 100, heightMm: 100, group: "thermal", common: true },
  { id: "thermal-100x75", name: "100 × 75 mm", label: "Thermal 100 × 75 mm", widthMm: 100, heightMm: 75, group: "thermal", common: true },
];

export const SLIP_FAMILIES: ReadonlyArray<{ id: SlipFamily; label: string; hint: string }> = [
  { id: "office", label: "Plain paper", hint: "Office and home printers" },
  { id: "photo", label: "Photo & card", hint: "Photo paper and card stock" },
  { id: "thermal", label: "Thermal label roll", hint: "Shipping-label printers" },
  { id: "custom", label: "Custom", hint: "Enter your own measurements" },
];

export function slipPapersInGroup(group: SlipPaperGroup): SlipPaper[] {
  return SLIP_PAPERS.filter((p) => p.group === group);
}

/** The size line under a paper's name on its card. */
export function slipPaperDims(p: SlipPaper): string {
  if (p.group === "thermal") return "Thermal roll";
  const mm = `${p.widthMm} × ${p.heightMm} mm`;
  return p.inch ? `${p.inch} · ${mm}` : mm;
}

/** Per-order route: one slip, on the paper almost everyone has. */
export const SLIP_DEFAULT_PAPER_ID = "a4";
export const SLIP_DEFAULT_LAYOUT: SlipLayout = 1;
/** Batch route: the 4-up sheet, which is the point of printing a batch. */
export const SLIP_BATCH_LAYOUT: SlipLayout = 4;

export function findSlipPaper(id: string): SlipPaper | undefined {
  return SLIP_PAPERS.find((p) => p.id === id);
}

/**
 * Inner breathing room, proportional to the cell.
 *
 * A fixed value cannot serve both a 210 mm-wide A4 and an 89 mm card: 10 mm is
 * right on the first and eats a ninth of the second. Clamped so a huge sheet
 * does not get an absurd margin and a tiny one keeps a printable edge — most
 * inkjets cannot print within ~3 mm of the paper edge anyway.
 */
function paddingFor(cellWidthMm: number, cellHeightMm: number): number {
  const shorter = Math.min(cellWidthMm, cellHeightMm);
  return Math.round(Math.max(3, Math.min(10, shorter * 0.04)) * 10) / 10;
}

/**
 * Build the tiling for one paper + layout pairing.
 *
 * 2-up splits the page top/bottom and 4-up into quadrants, which keeps every
 * cell the same portrait-ish proportion the design is drawn for. Splitting
 * left/right instead would make a 2-up cell tall and thin and the artwork
 * would have to change — the whole point of the reference box is that it
 * does not.
 */
function presetFor(paper: SlipPaper, layout: SlipLayout): LabelPreset {
  return tiledPreset(paper, layout === 4 ? 2 : 1, layout === 1 ? 1 : 2);
}

function tiledPreset(paper: SlipPaper, across: number, down: number): LabelPreset {
  const widthMm = paper.widthMm / across;
  const heightMm = paper.heightMm / down;

  return {
    id: `${paper.id}@${across}x${down}`,
    label: `${paper.label} — ${across * down} up`,
    group: "single",
    // Always "sheet": the page dimensions are explicit here, so the roll
    // branch (which derives the page from the label) would only get in the way.
    kind: "sheet",
    widthMm,
    heightMm,
    across,
    down,
    gapXMm: 0,
    gapYMm: 0,
    pageWidthMm: paper.widthMm,
    pageHeightMm: paper.heightMm,
    marginTopMm: 0,
    marginLeftMm: 0,
    paddingMm: paddingFor(widthMm, heightMm),
    // Cut guides only when there is something to cut.
    guides: across * down > 1,
    defaultDpi: paper.group === "thermal" ? 203 : 600,
  };
}

export function resolveSlipProfile(opts: {
  paperId: string;
  layout: SlipLayout;
  custom: CustomStock;
  /** True when the paper picker is set to Custom. */
  useCustom?: boolean;
}): ResolvedProfile {
  if (opts.useCustom) {
    const preset = customPreset(opts.custom);
    return resolveProfile({ presetId: preset.id, custom: opts.custom, presets: [preset] });
  }
  const paper = findSlipPaper(opts.paperId) ?? SLIP_PAPERS[0];
  const preset = presetFor(paper, opts.layout);
  return resolveProfile({
    presetId: preset.id,
    custom: opts.custom,
    presets: [preset],
  });
}

/**
 * Custom stock for a slip is the PAGE, divided evenly — the same model as every
 * listed paper, so it gets the same proportional padding and cut guides.
 *
 * `widthMm` / `heightMm` are therefore the sheet that goes in the printer, not
 * one slip. They used to be read as a slip-sized cell on a forced A4 page,
 * which made a custom thermal size print in the corner of an A4 `@page`.
 *
 * Clamped here rather than on each keystroke, so a half-typed "1" on the way to
 * "150" does not snap under the cursor.
 */
function customPreset(c: CustomStock): LabelPreset {
  const n = (v: number, min: number, max: number, fallback: number) =>
    Number.isFinite(v) && v > 0 ? Math.min(max, Math.max(min, v)) : fallback;
  const widthMm = n(c.widthMm, 30, 1000, SLIP_REF_W_MM);
  const heightMm = n(c.heightMm, 30, 1000, SLIP_REF_H_MM);
  return tiledPreset(
    {
      id: "custom",
      label: `Custom — ${widthMm} × ${heightMm} mm`,
      name: `Custom ${widthMm} × ${heightMm} mm`,
      widthMm,
      heightMm,
      group: "office",
    },
    Math.round(n(c.across, 1, 6, 1)),
    Math.round(n(c.down, 1, 6, 1)),
  );
}

/** Custom slip stock starts at the reference box rather than a label size. */
export const SLIP_DEFAULT_CUSTOM: CustomStock = {
  kind: "sheet",
  widthMm: SLIP_REF_W_MM,
  heightMm: SLIP_REF_H_MM,
  across: 1,
  down: 1,
  gapXMm: 0,
  gapYMm: 0,
  marginTopMm: 0,
  marginLeftMm: 0,
  paddingMm: 4,
};

/** Lower clamp on `slipScale` — below this an address stops being readable. */
export const SLIP_MIN_SCALE = 0.55;

/**
 * The unclamped ratio of this cell to the reference box.
 *
 * `min` of the two axes, not an average: overshooting on either one is what
 * pushes text out of the box, and the merchant's own printed sample was
 * clipped for exactly that reason.
 */
export function slipRawScale(p: ResolvedProfile): number {
  const inner = (v: number) => Math.max(1, v - 2 * p.paddingMm);
  return Math.min(
    inner(p.widthMm) / (SLIP_REF_W_MM - 6),
    inner(p.heightMm) / (SLIP_REF_H_MM - 6),
  );
}

/**
 * How much to scale the slip's typography for this stock.
 *
 * ≈1.0 on an A6 quadrant and on the 4×6" roll, ≈1.9 on a full A4.
 */
export function slipScale(p: ResolvedProfile): number {
  return Math.min(2.4, Math.max(SLIP_MIN_SCALE, slipRawScale(p)));
}

/**
 * True for a pairing that has hit the scale floor — the cell is too small for
 * the design and the slip will be cramped or clipped. Depends on the stock
 * alone; nothing on the slip can be switched off to change it.
 */
export function slipTooSmall(p: ResolvedProfile): boolean {
  return slipRawScale(p) < SLIP_MIN_SCALE;
}
