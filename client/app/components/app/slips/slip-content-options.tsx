/**
 * "What should the slip include?"
 *
 * Hovering a row highlights the matching zone in the rail preview — which is
 * why `onHover` exists at all.
 */
import type { SlipZone } from "~/components/app/package-slip";
import { Checkbox } from "~/components/ui/checkbox";
import { cn } from "~/lib/utils";

const ROWS: Array<{ zone: SlipZone; label: string; help: string }> = [
  {
    zone: "barcode",
    label: "Space for courier label",
    help: "Leaves the “Barcode :” area blank so the courier's own shipping label can be stuck there.",
  },
  {
    zone: "items",
    label: "Item list",
    help: "Lists what's in the parcel with SKU and quantity — handy if packers work from the slip.",
  },
];

export function SlipContentOptions({
  showBarcodeZone,
  showItems,
  onToggle,
  onHover,
}: {
  showBarcodeZone: boolean;
  showItems: boolean;
  onToggle: (zone: SlipZone) => void;
  onHover: (zone: SlipZone | null) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {ROWS.map((row, i) => (
        <label
          key={row.zone}
          onMouseEnter={() => onHover(row.zone)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(row.zone)}
          onBlur={() => onHover(null)}
          className={cn(
            "flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/60",
            i < ROWS.length - 1 && "border-b border-border",
          )}
        >
          <Checkbox
            checked={row.zone === "barcode" ? showBarcodeZone : showItems}
            onCheckedChange={() => onToggle(row.zone)}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="block text-label text-foreground">{row.label}</span>
            <span className="block text-caption leading-relaxed text-muted-foreground">
              {row.help}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}
