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
  widthMm: number;
  heightMm: number;
  group: "office" | "photo" | "thermal";
}

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
  { id: "a4", label: "A4 — 210 × 297 mm", widthMm: 210, heightMm: 297, group: "office" },
  { id: "letter", label: "Letter — 8.5 × 11 in", widthMm: 215.9, heightMm: 279.4, group: "office" },
  { id: "a5", label: "A5 — 148 × 210 mm", widthMm: 148, heightMm: 210, group: "office" },
  { id: "a6", label: "A6 — 105 × 148 mm", widthMm: 105, heightMm: 148, group: "office" },
  { id: "b5", label: "B5 — 182 × 257 mm", widthMm: 182, heightMm: 257, group: "office" },
  { id: "b6", label: "B6 — 128 × 182 mm", widthMm: 128, heightMm: 182, group: "office" },
  { id: "legal", label: "Legal — 8.5 × 14 in", widthMm: 215.9, heightMm: 355.6, group: "office" },
  { id: "folio", label: "Folio — 8.5 × 13 in", widthMm: 215.9, heightMm: 330.2, group: "office" },
  {
    id: "indian-legal",
    label: "Indian Legal — 215 × 345 mm",
    widthMm: 215,
    heightMm: 345,
    group: "office",
  },
  { id: "16k", label: "16K — 195 × 270 mm", widthMm: 195, heightMm: 270, group: "office" },

  // --- Photo / card stock ---------------------------------------------------
  {
    id: "4x6",
    label: '4 × 6 in / 10 × 15 cm — 101.6 × 152.4 mm',
    widthMm: 101.6,
    heightMm: 152.4,
    group: "photo",
  },
  { id: "postcard", label: "Post Card — 100 × 148 mm", widthMm: 100, heightMm: 148, group: "photo" },
  { id: "5x7", label: "5 × 7 in — 127 × 178 mm", widthMm: 127, heightMm: 178, group: "photo" },
  { id: "5x8", label: "5 × 8 in — 127 × 203 mm", widthMm: 127, heightMm: 203, group: "photo" },
  { id: "8x10", label: "8 × 10 in — 203 × 254 mm", widthMm: 203.2, heightMm: 254, group: "photo" },
  { id: "3.5x5", label: "3.5 × 5 in — 89 × 127 mm", widthMm: 89, heightMm: 127, group: "photo" },
  { id: "16-9", label: "16:9 wide — 102 × 181 mm", widthMm: 102, heightMm: 181, group: "photo" },

  // --- Thermal label rolls --------------------------------------------------
  {
    id: "thermal-100x150",
    label: "Thermal 100 × 150 mm (4 × 6\")",
    widthMm: 100,
    heightMm: 150,
    group: "thermal",
  },
  { id: "thermal-100x100", label: "Thermal 100 × 100 mm", widthMm: 100, heightMm: 100, group: "thermal" },
  { id: "thermal-100x75", label: "Thermal 100 × 75 mm", widthMm: 100, heightMm: 75, group: "thermal" },
];

export const SLIP_PAPER_GROUPS: ReadonlyArray<{ id: SlipPaper["group"]; label: string }> = [
  { id: "office", label: "Plain paper" },
  { id: "photo", label: "Photo & card" },
  { id: "thermal", label: "Thermal label rolls" },
];

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
  const across = layout === 4 ? 2 : 1;
  const down = layout === 1 ? 1 : 2;
  const widthMm = paper.widthMm / across;
  const heightMm = paper.heightMm / down;

  return {
    id: `${paper.id}@${layout}`,
    label: `${paper.label} — ${layout} up`,
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
    guides: layout > 1,
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
    return resolveProfile({ presetId: "custom", custom: opts.custom, presets: [] });
  }
  const paper = findSlipPaper(opts.paperId) ?? SLIP_PAPERS[0];
  const preset = presetFor(paper, opts.layout);
  return resolveProfile({
    presetId: preset.id,
    custom: opts.custom,
    presets: [preset],
  });
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
 * How much to scale the slip's typography for this stock.
 *
 * `min` of the two axes, not an average: overshooting on either one is what
 * pushes text out of the box, and the merchant's own printed sample was
 * clipped for exactly that reason.
 *
 * ≈1.0 on an A6 quadrant and on the 4×6" roll, ≈1.9 on a full A4.
 */
export function slipScale(p: ResolvedProfile): number {
  const inner = (v: number) => Math.max(1, v - 2 * p.paddingMm);
  const raw = Math.min(
    inner(p.widthMm) / (SLIP_REF_W_MM - 6),
    inner(p.heightMm) / (SLIP_REF_H_MM - 6),
  );
  return Math.min(2.4, Math.max(SLIP_MIN_SCALE, raw));
}

/**
 * Warning for a pairing that has hit the scale floor — the cell is too small
 * for the design and the slip will be cramped or clipped. Returned as text
 * rather than a boolean so the toolbar can say what to do about it.
 */
export function slipFitWarning(p: ResolvedProfile): string | null {
  const inner = (v: number) => Math.max(1, v - 2 * p.paddingMm);
  const raw = Math.min(
    inner(p.widthMm) / (SLIP_REF_W_MM - 6),
    inner(p.heightMm) / (SLIP_REF_H_MM - 6),
  );
  if (raw >= SLIP_MIN_SCALE) return null;
  return `Each slip is only ${p.widthMm.toFixed(0)} × ${p.heightMm.toFixed(0)} mm here — too small for the full layout. Use a larger paper size, fewer per sheet, or turn off the barcode space and item list.`;
}
