import { Trash2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";
import {
  CONDITION_FIELD_LABELS,
  CONDITION_OPERATOR_LABELS,
  type AutomationCondition,
  type ConditionField,
  type ConditionOperator,
} from "~/lib/campaigns-placeholder-data";

const FIELDS = Object.keys(CONDITION_FIELD_LABELS) as ConditionField[];
const OPERATORS = Object.keys(CONDITION_OPERATOR_LABELS) as ConditionOperator[];

/** Operators that compare against nothing, so the value input is meaningless. */
const VALUELESS: ReadonlySet<ConditionOperator> = new Set([
  "is_true",
  "is_false",
  "is_set",
  "is_not_set",
]);

interface ConditionStepProps {
  condition: AutomationCondition;
  /** Omitted on the detail page. A locked condition ignores it either way. */
  onChange?: (patch: Partial<AutomationCondition>) => void;
  /** Omitted for locked conditions and on the detail page. */
  onRemove?: () => void;
}

/** A single gate the event has to clear before the action runs. */
export function ConditionStep({
  condition,
  onChange,
  onRemove,
}: ConditionStepProps) {
  const needsValue = !VALUELESS.has(condition.operator);
  // A locked condition is enforced by the send path itself, so it stays
  // read-only even inside the create form.
  const isEditable = !!onChange && !condition.locked;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-label text-muted-foreground">Field</Label>
          <Select
            value={condition.field}
            disabled={!isEditable}
            onValueChange={(next) => onChange?.({ field: next as ConditionField })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELDS.map((field) => (
                <SelectItem key={field} value={field}>
                  {CONDITION_FIELD_LABELS[field]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-label text-muted-foreground">Comparison</Label>
          <Select
            value={condition.operator}
            disabled={!isEditable}
            onValueChange={(next) =>
              onChange?.({ operator: next as ConditionOperator })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map((operator) => (
                <SelectItem key={operator} value={operator}>
                  {CONDITION_OPERATOR_LABELS[operator]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {needsValue && (
          <div className="space-y-1.5">
            <Label className="text-label text-muted-foreground">Value</Label>
            <Input
              value={String(condition.value ?? "")}
              disabled={!isEditable}
              readOnly={!isEditable}
              onChange={(event) => onChange?.({ value: event.target.value })}
            />
          </div>
        )}
      </div>

      {onRemove && (
        <Button variant="ghost" size="xs" onClick={onRemove}>
          <Trash2 />
          Remove condition
        </Button>
      )}
    </div>
  );
}
