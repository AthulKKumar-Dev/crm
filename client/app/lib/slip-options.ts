/**
 * What the package-slip editor remembers on this device — pure, no React.
 *
 * Two keys, one per route: printing one parcel and printing the day's batch are
 * different jobs and merchants pick different paper for each.
 */
import type { CustomStock } from "./label-stock";
import {
  SLIP_DEFAULT_CUSTOM,
  SLIP_LAYOUTS,
  findSlipPaper,
  type SlipLayout,
} from "./slip-stock";

export const CUSTOM_PAPER_ID = "__custom__";

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

export const EMPTY_OVERRIDES: SlipStoreOverrides = {
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
  /** `widthMm` × `heightMm` is the PAGE here — see `customPreset`. */
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

export function loadSlipOptions(
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
    // Spread over the defaults so a blob written by an older build still yields
    // a usable shape.
    const merged: SlipSheetOptions = {
      ...fallback,
      ...parsed,
      custom: { ...fallback.custom, ...(parsed.custom ?? {}) },
      overrides: { ...EMPTY_OVERRIDES, ...(parsed.overrides ?? {}) },
    };
    // A paper that no longer exists would leave the picker with no pill lit and
    // no card selected while the sheet quietly printed on the first paper.
    if (merged.paperId !== CUSTOM_PAPER_ID && !findSlipPaper(merged.paperId)) {
      merged.paperId = fallback.paperId;
    }
    if (!SLIP_LAYOUTS.some((l) => l.value === merged.layout)) {
      merged.layout = fallback.layout;
    }
    return merged;
  } catch {
    return fallback;
  }
}

export function saveSlipOptions(storageKey: string, options: SlipSheetOptions): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(options));
  } catch {
    /* private mode / quota — the preference is a convenience, not state */
  }
}

export function hasOverrides(ov: SlipStoreOverrides): boolean {
  return Object.values(ov).some((v) => v.trim());
}
