/**
 * "How many slips per sheet?" — the 1 / 2 / 4-up every print driver offers,
 * with the verdict a driver never gives: whether a slip that size is readable.
 */
import { Badge } from "~/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import type { CustomStock } from "~/lib/label-stock";
import {
  SLIP_LAYOUTS,
  resolveSlipProfile,
  slipTooSmall,
  type SlipLayout,
} from "~/lib/slip-stock";
import { SLIP_CARD_CLASS } from "./slip-paper-picker";

export function SlipLayoutPicker({
  paperId,
  custom,
  value,
  onSelect,
}: {
  paperId: string;
  custom: CustomStock;
  value: SlipLayout;
  onSelect: (layout: SlipLayout) => void;
}) {
  return (
    <RadioGroup
      value={String(value)}
      onValueChange={(v) => onSelect(Number(v) as SlipLayout)}
      aria-label="Slips per sheet"
      className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
    >
      {SLIP_LAYOUTS.map(({ value: n }) => {
        const id = `slip-layout-${n}`;
        // The same resolver the sheet uses, so the badge cannot disagree with
        // the warning the rail shows once this card is picked.
        const p = resolveSlipProfile({ paperId, layout: n, custom });
        const each = `${p.widthMm.toFixed(0)} × ${p.heightMm.toFixed(0)} mm`;
        return (
          <label key={n} htmlFor={id} className={SLIP_CARD_CLASS}>
            <RadioGroupItem value={String(n)} id={id} className="sr-only" />
            <span
              aria-hidden
              className="grid h-10 w-7.5 flex-none gap-0.5 border border-muted-foreground/60 bg-white p-0.5"
              style={{
                gridTemplateColumns: `repeat(${p.across}, 1fr)`,
                gridTemplateRows: `repeat(${p.down}, 1fr)`,
              }}
            >
              {Array.from({ length: n }, (_, i) => (
                <span key={i} className="rounded-xs bg-muted-foreground/25" />
              ))}
            </span>
            <span className="min-w-0">
              <span className="block text-label text-foreground">
                {n === 1 ? "1 per sheet" : `${n} per sheet`}
              </span>
              <span className="block text-caption text-muted-foreground">
                {n === 1 ? "No cutting" : `Cut ${n === 2 ? "once" : "twice"} · ${each}`}
              </span>
              {slipTooSmall(p) && (
                <Badge className="mt-1.5 bg-warning-subtle text-warning-strong">
                  Too small to read
                </Badge>
              )}
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
