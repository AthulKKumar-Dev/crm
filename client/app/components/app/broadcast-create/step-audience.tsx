import { Info } from "lucide-react";

import { SAMPLE_AUDIENCES } from "~/lib/campaigns-placeholder-data";
import { cn } from "~/lib/utils";

interface StepAudienceProps {
  value: string | null;
  onChange: (audienceId: string) => void;
}

/**
 * Step 1 — who the broadcast goes to.
 *
 * A custom segment builder is deliberately absent. Arbitrary targeting is the
 * single most misleading control this scaffold could show, and the saved
 * segments below are enough to make the flow legible.
 */
export function StepAudience({ value, onChange }: StepAudienceProps) {
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="sr-only">Choose an audience</legend>

        {SAMPLE_AUDIENCES.map((aud) => {
          const isSelected = aud.id === value;

          return (
            <label
              key={aud.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
                isSelected
                  ? "border-brand bg-brand/10"
                  : "border-border hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="broadcast-audience"
                value={aud.id}
                checked={isSelected}
                onChange={() => onChange(aud.id)}
                className="mt-1 accent-brand-forest"
              />
              <div className="flex-1">
                <p className="text-body font-medium text-foreground">{aud.label}</p>
                <p className="text-caption text-muted-foreground">
                  {aud.description}
                </p>
              </div>
              <p className="text-section tabular-nums text-foreground">
                {aud.size.toLocaleString()}
              </p>
            </label>
          );
        })}
      </fieldset>

      {/* Mirrors the gates whatsapp-trigger.service.ts applies before it
          enqueues, so the count above matches what a real send would attempt. */}
      <div className="flex items-start gap-2 rounded-lg bg-muted p-3">
        <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <p className="text-caption text-muted-foreground">
          These counts already exclude anyone without marketing consent or
          without a phone number that resolves to a valid international format.
          Both are hard requirements before a WhatsApp message can be sent.
        </p>
      </div>
    </div>
  );
}
