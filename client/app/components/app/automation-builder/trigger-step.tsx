import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Label } from "~/components/ui/label";
import {
  TRIGGER_LABELS,
  type AutomationTriggerType,
} from "~/lib/campaigns-placeholder-data";

const TRIGGER_TYPES = Object.keys(TRIGGER_LABELS) as AutomationTriggerType[];

interface TriggerStepProps {
  value: AutomationTriggerType;
  /**
   * Omitted on the detail page, where the trigger is fixed in code. Supplying it
   * makes the control live, so the create form and the read-only builder can
   * share one component instead of drifting apart.
   */
  onChange?: (value: AutomationTriggerType) => void;
}

/** The event that starts the flow. */
export function TriggerStep({ value, onChange }: TriggerStepProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-label text-muted-foreground">Trigger event</Label>
      <Select
        value={value}
        disabled={!onChange}
        onValueChange={(next) => onChange?.(next as AutomationTriggerType)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TRIGGER_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {TRIGGER_LABELS[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
