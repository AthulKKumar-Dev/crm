/**
 * Label stock presets and page geometry — pure, no React, no DOM.
 *
 * The model is deliberately three-layered, which is what every serious label
 * tool converges on: MEDIA (a preset or a custom W×H) → LAYOUT (how many across
 * and down, gaps, margins) → CONTENT (toggles, handled by the route). One
 * barcode engine serves every size; the preset only decides how much room the
 * symbol gets. Never add a per-size barcode generator.
 *
 * "With gap" vs "no gap" is a physical property of the die-cut roll: labels
 * butted edge-to-edge across the web, or separated by a liner gap. It changes
 * only `gapXMm` and therefore the page width the printer driver must match.
 * Row sensing (gap / black-mark / continuous) is a printer setting and has no
 * bearing on our geometry.
 */

export type StockKind = "roll" | "sheet";
export type PresetGroup = "primary" | "more" | "jewellery" | "sheet" | "custom";

/**
 * A printable region inside the media. Jewellery stock is NOT fully printable —
 * a barbell tag is two small panels with a keep-clear strap between them where
 * the die narrows to a shank that wraps the ring. Absent = the whole label
 * minus padding, which is every ordinary preset.
 */
export interface PrintableWindow {
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
  role: "barcode" | "info";
}

export interface LabelPreset {
  id: string;
  label: string;
  group: PresetGroup;
  kind: StockKind;
  widthMm: number;
  heightMm: number;
  across: number;
  down: number;
  gapXMm: number;
  gapYMm: number;
  /** Sheets only; rolls derive the page from the label. */
  pageWidthMm?: number;
  pageHeightMm?: number;
  marginTopMm: number;
  marginLeftMm: number;
  paddingMm: number;
  /** Dashed cut guides — only for plain paper you cut yourself. */
  guides: boolean;
  defaultDpi: number;
  printableWindows?: PrintableWindow[];
  hint?: string;
}

export interface CustomStock {
  kind: StockKind;
  widthMm: number;
  heightMm: number;
  across: number;
  down: number;
  gapXMm: number;
  gapYMm: number;
  marginTopMm: number;
  marginLeftMm: number;
  paddingMm: number;
}

export interface ResolvedProfile {
  id: string;
  label: string;
  kind: StockKind;
  widthMm: number;
  heightMm: number;
  across: number;
  down: number;
  gapXMm: number;
  gapYMm: number;
  pageWidthMm: number;
  pageHeightMm: number;
  marginTopMm: number;
  marginLeftMm: number;
  paddingMm: number;
  guides: boolean;
  perPage: number;
  /** Width the barcode may occupy — the barcode window, or the content box. */
  contentWidthMm: number;
  contentHeightMm: number;
  printableWindows?: PrintableWindow[];
  hint?: string;
}

const A4_W = 210;
const A4_H = 297;

/**
 * Inner padding for small stock (≤ 38 mm wide).
 *
 * Padding is purely our own breathing room — the barcode's quiet zone is
 * already counted inside its symbol width, so every millimetre spent here is a
 * millimetre the code cannot use. On a 30 × 20 label, 1.5 mm padding left
 * 27 mm and an 8-char code computed X = 0.1888 mm against the 0.19 mm floor:
 * refused by 0.0012 mm. 1.0 mm yields 28 mm and 0.1958 mm, which prints (with
 * a "check scan" warning) instead of being rejected over nothing.
 */
const SMALL_STOCK_PADDING_MM = 1;

/**
 * Jewellery windows.
 *
 * Barbell 54×11 (Dymo 11351 class): two ~18×10 panels at each end, ~18 mm
 * strap between them of which only ~5 mm height is material. The panels fold
 * back-to-back so one face carries the barcode and the other the price.
 *
 * The Indian long-flag tags (100×15, 81×12) have ONE printable panel at the
 * leading edge — 65 mm and 56 mm respectively — which folds in half at a
 * perforation, so it is modelled as two equal sub-panels. Everything past the
 * panel is tail and flap and must stay blank.
 */
const BARBELL_54x11: PrintableWindow[] = [
  { xMm: 0, yMm: 0.5, wMm: 18, hMm: 10, role: "barcode" },
  { xMm: 36, yMm: 0.5, wMm: 18, hMm: 10, role: "info" },
];
const LONGFLAG_100x15: PrintableWindow[] = [
  { xMm: 0, yMm: 0, wMm: 32.5, hMm: 15, role: "barcode" },
  { xMm: 32.5, yMm: 0, wMm: 32.5, hMm: 15, role: "info" },
];
const LONGFLAG_81x12: PrintableWindow[] = [
  { xMm: 0, yMm: 0, wMm: 28, hMm: 12, role: "barcode" },
  { xMm: 28, yMm: 0, wMm: 28, hMm: 12, role: "info" },
];
// Butterfly flap dimensions are not published by any vendor; these are a
// conservative estimate. Merchants with a die drawing should use Custom.
const BUTTERFLY_30x10: PrintableWindow[] = [
  { xMm: 0, yMm: 0, wMm: 11, hMm: 10, role: "barcode" },
  { xMm: 19, yMm: 0, wMm: 11, hMm: 10, role: "info" },
];

const roll = (
  id: string,
  label: string,
  group: PresetGroup,
  widthMm: number,
  heightMm: number,
  across = 1,
  gapXMm = 0,
  extra: Partial<LabelPreset> = {},
): LabelPreset => ({
  id,
  label,
  group,
  kind: "roll",
  widthMm,
  heightMm,
  across,
  down: 1,
  gapXMm,
  gapYMm: 0,
  marginTopMm: 0,
  marginLeftMm: 0,
  paddingMm: 2,
  guides: false,
  defaultDpi: 203,
  ...extra,
});

export const LABEL_PRESETS: LabelPreset[] = [
  // --- Group 1: the ten first-production sizes -----------------------------
  roll("roll-50x25", "50 × 25 mm — 1 up", "primary", 50, 25),
  roll("roll-50x25-2up-gap", "50 × 25 mm — 2 up — with gap", "primary", 50, 25, 2, 3),
  roll("roll-50x25-2up-nogap", "50 × 25 mm — 2 up — no gap", "primary", 50, 25, 2, 0),
  roll("roll-38x25-2up-gap", "38 × 25 mm — 2 up — with gap", "primary", 38, 25, 2, 3),
  roll("roll-38x25-2up-nogap", "38 × 25 mm — 2 up — no gap", "primary", 38, 25, 2, 0),
  roll("roll-50x50", "50 × 50 mm — 1 up", "primary", 50, 50),
  roll("roll-60x40", "60 × 40 mm — 1 up", "primary", 60, 40),
  roll("roll-70x40", "70 × 40 mm — 1 up", "primary", 70, 40),
  roll("roll-100x70", "100 × 70 mm — 1 up", "primary", 100, 70),
  roll("roll-54x11-jewel", "54 × 11 mm — jewellery barbell", "primary", 54, 11, 1, 0, {
    paddingMm: 0,
    printableWindows: BARBELL_54x11,
    hint: "Black-mark stock — calibrate the printer's mark sensor. Two 18 × 10 mm panels fold back-to-back. Use short numeric codes: an 18-character SKU cannot fit a panel this small at any printer resolution.",
  }),

  // --- Group 2: additional standard sizes ----------------------------------
  roll("roll-38x25", "38 × 25 mm — 1 up", "more", 38, 25),
  roll("roll-40x20", "40 × 20 mm — 1 up", "more", 40, 20),
  roll("roll-50x30", "50 × 30 mm — 1 up", "more", 50, 30),
  roll("roll-25x15-3up", "25 × 15 mm — 3 up", "more", 25, 15, 3, 2, {
    paddingMm: SMALL_STOCK_PADDING_MM,
    hint: "Small stock — use short numeric codes. A finer printer does not help: what fits is set by label width, not resolution.",
  }),
  roll("roll-75x50", "75 × 50 mm — 1 up", "more", 75, 50),
  roll("roll-100x150", "100 × 150 mm — shipping", "more", 100, 150),

  // --- Group 3: jewellery ---------------------------------------------------
  roll("roll-100x15-jewel", "100 × 15 mm — jewellery tag (65 mm printable)", "jewellery", 100, 15, 1, 0, {
    paddingMm: 0,
    printableWindows: LONGFLAG_100x15,
    hint: "Printable panel is the first 65 mm; the tail and flap stay blank. The panel folds in half at the perforation.",
  }),
  roll("roll-81x12-jewel", "81 × 12 mm — jewellery tag (56 mm printable)", "jewellery", 81, 12, 1, 0, {
    paddingMm: 0,
    printableWindows: LONGFLAG_81x12,
    hint: "Printable panel is the first 56 mm; the tail and flap stay blank.",
  }),
  roll("roll-30x10-jewel", "30 × 10 mm — butterfly", "jewellery", 30, 10, 1, 0, {
    paddingMm: 0,
    printableWindows: BUTTERFLY_30x10,
    hint: "Flap dimensions vary by supplier — if yours differ, use Custom with your die drawing.",
  }),
  roll("roll-30x20", "30 × 20 mm — small jewellery", "jewellery", 30, 20, 1, 0, { paddingMm: SMALL_STOCK_PADDING_MM }),
  roll("roll-20x30", "20 × 30 mm — small jewellery, portrait", "jewellery", 20, 30, 1, 0, {
    paddingMm: SMALL_STOCK_PADDING_MM,
    hint: "Indian suppliers usually stock this as 30 × 20 landscape — check your roll before printing.",
  }),

  // --- Group 4: A4 sheets ---------------------------------------------------
  {
    id: "sheet-a4-plain",
    label: "A4 plain paper — 50 × 25 mm, 3 across",
    group: "sheet",
    kind: "sheet",
    widthMm: 50,
    heightMm: 25,
    across: 3,
    down: 11,
    gapXMm: 0,
    gapYMm: 0,
    pageWidthMm: A4_W,
    pageHeightMm: A4_H,
    marginTopMm: 8,
    marginLeftMm: 8,
    paddingMm: 2,
    guides: true,
    defaultDpi: 600,
    hint: "Prints on plain A4 — cut along the dashed guides.",
  },
  {
    id: "sheet-a4-65",
    label: "A4 sticker — 65 up (38.1 × 21.2 mm)",
    group: "sheet",
    kind: "sheet",
    widthMm: 38.1,
    heightMm: 21.2,
    across: 5,
    down: 13,
    gapXMm: 2.5,
    gapYMm: 0,
    pageWidthMm: A4_W,
    pageHeightMm: A4_H,
    marginTopMm: 10.7,
    marginLeftMm: 4.75,
    paddingMm: SMALL_STOCK_PADDING_MM,
    guides: false,
    defaultDpi: 600,
  },
  {
    id: "sheet-a4-24",
    label: "A4 sticker — 24 up (63.5 × 33.9 mm)",
    group: "sheet",
    kind: "sheet",
    widthMm: 63.5,
    heightMm: 33.9,
    across: 3,
    down: 8,
    gapXMm: 2.5,
    gapYMm: 0,
    pageWidthMm: A4_W,
    pageHeightMm: A4_H,
    marginTopMm: 12.9,
    marginLeftMm: 7.25,
    paddingMm: 2,
    guides: false,
    defaultDpi: 600,
  },
];

export const CUSTOM_PRESET_ID = "custom";

export const DEFAULT_CUSTOM: CustomStock = {
  kind: "roll",
  widthMm: 50,
  heightMm: 25,
  across: 1,
  down: 1,
  gapXMm: 2,
  gapYMm: 0,
  marginTopMm: 0,
  marginLeftMm: 0,
  paddingMm: 2,
};

export function findPreset(id: string): LabelPreset | undefined {
  return LABEL_PRESETS.find((p) => p.id === id);
}

/** Clamp custom input to something that can physically produce a page. */
function sanitizeCustom(c: CustomStock): CustomStock {
  const n = (v: number, min: number, max: number, fallback: number) =>
    Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    kind: c.kind === "sheet" ? "sheet" : "roll",
    widthMm: n(c.widthMm, 5, 300, 50),
    heightMm: n(c.heightMm, 5, 300, 25),
    across: Math.round(n(c.across, 1, 12, 1)),
    down: Math.round(n(c.down, 1, 60, 1)),
    gapXMm: n(c.gapXMm, 0, 50, 0),
    gapYMm: n(c.gapYMm, 0, 50, 0),
    marginTopMm: n(c.marginTopMm, 0, 100, 0),
    marginLeftMm: n(c.marginLeftMm, 0, 100, 0),
    paddingMm: n(c.paddingMm, 0, 20, 2),
  };
}

/**
 * Turn a chosen preset (or custom stock) into concrete page numbers.
 *
 * Roll pages are ONE die-cut row: page width spans the labels across the web,
 * page height is one label. That is what a gap-sensor printer expects, and it
 * makes `perPage === across` fall out of the same model the sheets use.
 */
export function resolveProfile(opts: {
  presetId: string;
  custom: CustomStock;
}): ResolvedProfile {
  const preset = findPreset(opts.presetId);

  let base: Omit<LabelPreset, "id" | "label" | "group" | "defaultDpi">;
  let id: string;
  let label: string;

  if (preset) {
    base = preset;
    id = preset.id;
    label = preset.label;
  } else {
    const c = sanitizeCustom(opts.custom);
    id = CUSTOM_PRESET_ID;
    label = `Custom — ${c.widthMm} × ${c.heightMm} mm`;
    base = {
      kind: c.kind,
      widthMm: c.widthMm,
      heightMm: c.heightMm,
      across: c.across,
      down: c.kind === "sheet" ? c.down : 1,
      gapXMm: c.gapXMm,
      gapYMm: c.gapYMm,
      pageWidthMm: c.kind === "sheet" ? A4_W : undefined,
      pageHeightMm: c.kind === "sheet" ? A4_H : undefined,
      marginTopMm: c.marginTopMm,
      marginLeftMm: c.marginLeftMm,
      paddingMm: c.paddingMm,
      guides: false,
    };
  }

  const across = Math.max(1, base.across);
  const down = Math.max(1, base.down);

  const pageWidthMm =
    base.kind === "sheet"
      ? (base.pageWidthMm ?? A4_W)
      : across * base.widthMm + (across - 1) * base.gapXMm;
  const pageHeightMm =
    base.kind === "sheet"
      ? (base.pageHeightMm ?? A4_H)
      : base.heightMm;

  // The barcode gets the barcode window when the die has one, otherwise the
  // whole label minus padding.
  const barcodeWindow = base.printableWindows?.find((w) => w.role === "barcode");
  const contentWidthMm = barcodeWindow
    ? barcodeWindow.wMm - 2 * base.paddingMm
    : base.widthMm - 2 * base.paddingMm;
  const contentHeightMm = barcodeWindow
    ? barcodeWindow.hMm - 2 * base.paddingMm
    : base.heightMm - 2 * base.paddingMm;

  return {
    id,
    label,
    kind: base.kind,
    widthMm: base.widthMm,
    heightMm: base.heightMm,
    across,
    down: base.kind === "sheet" ? down : 1,
    gapXMm: base.gapXMm,
    gapYMm: base.gapYMm,
    pageWidthMm,
    pageHeightMm,
    marginTopMm: base.marginTopMm,
    marginLeftMm: base.marginLeftMm,
    paddingMm: base.paddingMm,
    guides: base.guides,
    perPage: base.kind === "sheet" ? across * down : across,
    contentWidthMm: Math.max(1, contentWidthMm),
    contentHeightMm: Math.max(1, contentHeightMm),
    printableWindows: base.printableWindows,
    hint: base.hint,
  };
}

/**
 * `@page` and the break rules — the only things a <style> block must own.
 * Every geometric value lives in inline styles instead, so the on-screen
 * preview and the printed page are literally the same numbers (and because
 * Tailwind cannot generate arbitrary classes from runtime values).
 */
export function buildPageCss(p: ResolvedProfile): string {
  return `
    @page { size: ${p.pageWidthMm}mm ${p.pageHeightMm}mm; margin: 0; }
    .label-page { break-inside: avoid; page-break-inside: avoid; }
    .label-page:not(:last-child) { break-after: page; page-break-after: always; }
    .label-cell { break-inside: avoid; page-break-inside: avoid; }
    .barcode-svg { shape-rendering: crispEdges; }
  `;
}

/**
 * Presets ordered smallest-area first, for "what would fit instead?" lookups.
 * Custom stock is excluded — we can only recommend something the merchant can
 * actually pick from the list.
 */
export function presetsBySize(): LabelPreset[] {
  return [...LABEL_PRESETS].sort(
    (a, b) => a.widthMm * a.heightMm - b.widthMm * b.heightMm,
  );
}

/**
 * Split into explicit pages, with `null` placeholders for the cells skipped by
 * `startOffset` on a partly-used sticker sheet.
 *
 * Explicit chunking, rather than letting the browser reflow one long grid,
 * because pre-cut sheets need identical margins on EVERY page — a flowing grid
 * only gets them on page 1 — and a row gap landing on a page boundary would
 * otherwise shift everything after it.
 */
export function chunkPages<T>(
  items: T[],
  perPage: number,
  startOffset: number,
): Array<Array<T | null>> {
  const size = Math.max(1, perPage);
  const skip = Math.max(0, Math.min(startOffset, size - 1));
  const slots: Array<T | null> = [...Array(skip).fill(null), ...items];
  const pages: Array<Array<T | null>> = [];
  for (let i = 0; i < slots.length; i += size) {
    const page = slots.slice(i, i + size);
    while (page.length < size) page.push(null);
    pages.push(page);
  }
  return pages;
}
