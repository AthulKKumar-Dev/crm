import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { TemplatePreview } from "~/components/app/whatsapp/template-preview";
import type {
  BroadcastAudience,
  WhatsAppTemplate,
  WhatsAppTemplateVariable,
} from "~/lib/campaigns-placeholder-data";
import { MERGE_FIELDS } from "~/lib/campaigns-placeholder-data";
import { cn } from "~/lib/utils";

export type BroadcastTiming = "now" | "later";

interface StepReviewProps {
  audience: BroadcastAudience;
  template: WhatsAppTemplate;
  variables: WhatsAppTemplateVariable[];
  timing: BroadcastTiming;
  scheduledFor: string;
  onTimingChange: (timing: BroadcastTiming) => void;
  onScheduledForChange: (value: string) => void;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="text-body text-right text-foreground">{value}</p>
    </div>
  );
}

/** Step 4 — when it goes out, and one last look at what goes out. */
export function StepReview({
  audience,
  template,
  variables,
  timing,
  scheduledFor,
  onTimingChange,
  onScheduledForChange,
}: StepReviewProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-label text-muted-foreground">Timing</legend>

          {(["now", "later"] as const).map((option) => (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                timing === option
                  ? "border-brand bg-brand/10"
                  : "border-border hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="broadcast-timing"
                value={option}
                checked={timing === option}
                onChange={() => onTimingChange(option)}
                className="accent-brand-forest"
              />
              <span className="text-body text-foreground">
                {option === "now" ? "Send as soon as it is approved" : "Schedule for later"}
              </span>
            </label>
          ))}
        </fieldset>

        {timing === "later" && (
          <div className="space-y-1.5">
            <Label className="text-label text-muted-foreground">
              Scheduled date and time
            </Label>
            <Input
              type="datetime-local"
              value={scheduledFor}
              onChange={(event) => onScheduledForChange(event.target.value)}
            />
          </div>
        )}

        <div className="divide-y divide-border rounded-lg border border-border px-4">
          <SummaryRow
            label="Audience"
            value={`${audience.label} · ${audience.size.toLocaleString()} contacts`}
          />
          <SummaryRow
            label="Template"
            value={`${template.name} · ${template.language}`}
          />
          <SummaryRow label="Category" value={template.category} />
          {variables.map((variable) => (
            <SummaryRow
              key={variable.index}
              label={`Placeholder {{${variable.index}}}`}
              value={
                variable.mappedTo
                  ? (MERGE_FIELDS.find((f) => f.value === variable.mappedTo)
                      ?.label ?? variable.mappedTo)
                  : variable.sampleValue || "—"
              }
            />
          ))}
          <SummaryRow
            label="Timing"
            value={timing === "now" ? "Immediately" : scheduledFor || "Not set"}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-label text-muted-foreground">Message preview</p>
        <TemplatePreview template={template} variables={variables} />
      </div>
    </div>
  );
}
