import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { TemplatePreview } from "~/components/app/whatsapp/template-preview";
import {
  SAMPLE_TEMPLATES,
  type AutomationAction,
} from "~/lib/campaigns-placeholder-data";

interface ActionStepProps {
  action: AutomationAction;
  /** Omitted on the detail page, where the action is fixed in code. */
  onChange?: (patch: Partial<AutomationAction>) => void;
}

/** What the automation does once the trigger fires and the conditions pass. */
export function ActionStep({ action, onChange }: ActionStepProps) {
  const template = SAMPLE_TEMPLATES.find((t) => t.name === action.templateName);
  const isEditable = !!onChange;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-label text-muted-foreground">
            WhatsApp template
          </Label>
          <Select
            value={action.templateName}
            disabled={!isEditable}
            onValueChange={(next) => onChange?.({ templateName: next })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SAMPLE_TEMPLATES.map((t) => (
                /* Meta rejects unapproved templates with error 132, so the same
                   constraint the composer enforces applies here. */
                <SelectItem
                  key={t.name}
                  value={t.name}
                  disabled={isEditable && t.status !== "APPROVED"}
                >
                  {t.name} · {t.language}
                  {t.status !== "APPROVED" && ` — ${t.status.toLowerCase()}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-label text-muted-foreground">Delay</Label>
          {isEditable ? (
            <>
              <Input
                type="number"
                min={0}
                value={action.delayMinutes}
                onChange={(event) =>
                  onChange?.({ delayMinutes: Number(event.target.value) || 0 })
                }
              />
              <p className="text-caption text-muted-foreground">
                Minutes to wait after the trigger. 0 sends straight away.
              </p>
            </>
          ) : (
            <Input
              value={
                action.delayMinutes === 0
                  ? "Send immediately"
                  : `${action.delayMinutes} minutes after the trigger`
              }
              disabled
              readOnly
            />
          )}
        </div>
      </div>

      {template && <TemplatePreview template={template} />}
    </div>
  );
}
