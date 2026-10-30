/**
 * Custom paper: the sheet that goes in the printer, and how to divide it.
 *
 * Values are clamped at resolve time (`customPreset` in slip-stock) rather than
 * on each keystroke, so a half-typed "1" on the way to "150" does not snap
 * under the cursor.
 */
import { Input } from "~/components/ui/input";
import type { CustomStock } from "~/lib/label-stock";

const FIELDS: Array<{
  key: "widthMm" | "heightMm" | "across" | "down";
  label: string;
  step: number;
  min: number;
}> = [
  { key: "widthMm", label: "Page width (mm)", step: 0.5, min: 30 },
  { key: "heightMm", label: "Page height (mm)", step: 0.5, min: 30 },
  { key: "across", label: "Slips across", step: 1, min: 1 },
  { key: "down", label: "Slips down", step: 1, min: 1 },
];

export function SlipCustomFields({
  custom,
  onChange,
}: {
  custom: CustomStock;
  onChange: (patch: Partial<CustomStock>) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/40 p-3">
      {FIELDS.map((f) => (
        <label key={f.key} className="grid gap-1">
          <span className="text-caption text-muted-foreground">{f.label}</span>
          <Input
            type="number"
            min={f.min}
            step={f.step}
            value={custom[f.key]}
            onChange={(e) => onChange({ [f.key]: Number(e.target.value) || 0 })}
            className="h-8 w-24"
          />
        </label>
      ))}
      <p className="max-w-60 text-caption leading-relaxed text-muted-foreground">
        The slip is designed for about 100 × 150 mm and scales to fit whatever you enter.
      </p>
    </div>
  );
}
