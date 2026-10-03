/**
 * "What paper are you printing on?" — family pills, then that family's sizes.
 *
 * Still PAPER SIZE × LAYOUT underneath, which is how the print dialog presents
 * it; the pills only cut a 20-entry list into the three kinds of stock a
 * merchant actually owns.
 */
import { SegmentedTabs } from "~/components/app/segmented-tabs";
import { Badge } from "~/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import {
  SLIP_FAMILIES,
  slipPaperDims,
  type SlipFamily,
  type SlipPaper,
} from "~/lib/slip-stock";
import { cn } from "~/lib/utils";

/** Proportional glyphs, `currentColor` so they invert with the active pill. */
const GLYPH: Record<SlipFamily, React.CSSProperties> = {
  office: { width: 11, height: 15, border: "1px solid currentColor" },
  photo: { width: 11, height: 15, border: "1px solid currentColor", borderRadius: 2 },
  thermal: {
    width: 12,
    height: 16,
    border: "1px solid currentColor",
    borderBottomStyle: "dashed",
    borderRadius: 2,
  },
  custom: { width: 12, height: 16, border: "1px dashed currentColor", borderRadius: 2 },
};

export function SlipFamilyTabs({
  value,
  onChange,
}: {
  value: SlipFamily;
  onChange: (next: SlipFamily) => void;
}) {
  return (
    <SegmentedTabs
      ariaLabel="Paper type"
      behaviour="filter"
      value={value}
      onChange={onChange}
      items={SLIP_FAMILIES.map((f) => ({
        value: f.id,
        label: f.label,
        icon: <span aria-hidden style={{ ...GLYPH[f.id], opacity: 0.75 }} />,
      }))}
    />
  );
}

/** Shared by the paper and layout cards so the two grids select identically. */
export const SLIP_CARD_CLASS = cn(
  "relative flex cursor-pointer gap-3 rounded-lg border border-border bg-card p-3 transition-colors",
  "hover:border-ink/30",
  "has-data-[state=checked]:border-brand-strong has-data-[state=checked]:bg-brand/10",
  "has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-brand-strong",
  // An outline, not a ring: the checked state already owns the ring, and the
  // radio that takes focus is visually hidden.
  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
);

/** Longest side of the thumbnail, in px. */
const THUMB_PX = 34;

export function SlipPaperGrid({
  papers,
  hiddenCount,
  showAll,
  onShowAllChange,
  value,
  onSelect,
}: {
  papers: SlipPaper[];
  /** How many more this family has behind the disclosure. */
  hiddenCount: number;
  showAll: boolean;
  onShowAllChange: (next: boolean) => void;
  value: string;
  onSelect: (paperId: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-label text-muted-foreground">Choose your paper size</h3>
        {(hiddenCount > 0 || showAll) && (
          <button
            type="button"
            onClick={() => onShowAllChange(!showAll)}
            className="text-caption font-medium text-brand-strong hover:underline"
          >
            {showAll ? "Show common sizes" : `Show all ${papers.length + hiddenCount} sizes`}
          </button>
        )}
      </div>

      <RadioGroup
        value={value}
        onValueChange={onSelect}
        aria-label="Paper size"
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3"
      >
        {papers.map((p) => {
          const id = `slip-paper-${p.id}`;
          const f = THUMB_PX / Math.max(p.widthMm, p.heightMm);
          return (
            <label key={p.id} htmlFor={id} className={cn(SLIP_CARD_CLASS, "items-center")}>
              {/* Visually hidden, not removed: the RadioGroup still owns roving
                  focus and arrow keys, and the checked styling keys off it. */}
              <RadioGroupItem value={p.id} id={id} className="sr-only" />
              <span aria-hidden className="grid h-9 w-9 flex-none place-items-center">
                <span
                  className="block rounded-xs border border-muted-foreground/60 bg-white"
                  style={{
                    width: Math.round(p.widthMm * f),
                    height: Math.round(p.heightMm * f),
                  }}
                />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-label text-foreground">{p.name}</span>
                  {p.recommended && (
                    <Badge className="bg-brand text-brand-foreground">Recommended</Badge>
                  )}
                </span>
                <span className="block text-caption text-muted-foreground">
                  {slipPaperDims(p)}
                </span>
              </span>
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}
