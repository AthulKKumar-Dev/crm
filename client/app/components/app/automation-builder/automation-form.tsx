import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { SectionCard } from "~/components/app/section-card";
import { NotYet } from "~/components/app/not-yet";
import { AutomationStep } from "./automation-step";
import { TriggerStep } from "./trigger-step";
import { ConditionStep } from "./condition-step";
import { ActionStep } from "./action-step";
import {
  CONDITION_FIELD_LABELS,
  CONDITION_OPERATOR_LABELS,
  TRIGGER_LABELS,
  type AutomationAction,
  type AutomationCondition,
  type AutomationTriggerType,
} from "~/lib/campaigns-placeholder-data";

/**
 * The two gates the send path applies to every WhatsApp message regardless of
 * what the rule says, so they are seeded into every new automation and cannot
 * be edited or removed. Showing them as ordinary conditions the user "chose"
 * would misrepresent where the constraint lives.
 */
function requiredConditions(): AutomationCondition[] {
  return [
    {
      id: "required_optin",
      field: "customer.accepts_marketing",
      operator: "is_true",
      locked: true,
      helpText:
        "Meta requires marketing opt-in. Applied to every automation — the send is skipped rather than attempted.",
    },
    {
      id: "required_phone",
      field: "customer.phone",
      operator: "is_set",
      locked: true,
      helpText:
        "The number must normalise to E.164. Applied to every automation.",
    },
  ];
}

const INITIAL_ACTION: AutomationAction = {
  id: "action_1",
  type: "send_whatsapp_template",
  templateName: "hello_world",
  templateLanguage: "en_US",
  triggerType: "order_placed",
  delayMinutes: 0,
};

/**
 * Create form for an automation.
 *
 * Deliberately the same vertical step layout as the read-only builder rather
 * than a wizard: an automation is one chain read top to bottom, and splitting
 * it across four screens would hide the shape the user is assembling.
 *
 * Nothing is saved. The terminal button is inert rather than firing a toast or
 * routing to a detail page — either would invent an automation the rest of the
 * app knows nothing about.
 */
export function AutomationForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<AutomationTriggerType>("order_placed");
  const [conditions, setConditions] = useState<AutomationCondition[]>(
    requiredConditions(),
  );
  const [action, setAction] = useState<AutomationAction>(INITIAL_ACTION);

  function addCondition() {
    setConditions((prev) => [
      ...prev,
      {
        id: `cond_${prev.length + 1}_${prev.length}`,
        field: "order.total",
        operator: "gte",
        value: "",
      },
    ]);
  }

  function updateCondition(id: string, patch: Partial<AutomationCondition>) {
    setConditions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }

  function removeCondition(id: string) {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  }

  // Trigger, then every condition, then the single action.
  const actionIndex = conditions.length + 2;

  return (
    <div className="max-w-2xl space-y-6">
      <SectionCard
        title="Name"
        description="How this automation appears in the list."
      >
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="automation-name" className="text-label text-muted-foreground">
              Automation name
            </Label>
            <Input
              id="automation-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Shipping notification"
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="automation-description"
              className="text-label text-muted-foreground"
            >
              Description
            </Label>
            <Textarea
              id="automation-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Tells the customer their parcel is on its way."
              rows={2}
            />
          </div>
        </div>
      </SectionCard>

      <div>
        <AutomationStep
          kind="trigger"
          index={1}
          isLast={false}
          title={TRIGGER_LABELS[trigger]}
          subtitle="Pick the event that starts this automation."
        >
          <TriggerStep
            value={trigger}
            onChange={(next) => {
              setTrigger(next);
              // Carried through to WhatsAppMessageJobData.triggerType, so it
              // has to follow the trigger rather than drift from it.
              setAction((prev) => ({ ...prev, triggerType: next }));
            }}
          />
        </AutomationStep>

        {conditions.map((condition, index) => (
          <AutomationStep
            key={condition.id}
            kind="condition"
            index={index + 2}
            isLast={false}
            title={`${CONDITION_FIELD_LABELS[condition.field]} ${
              CONDITION_OPERATOR_LABELS[condition.operator]
            }`}
            locked={condition.locked}
            helpText={condition.helpText}
          >
            <ConditionStep
              condition={condition}
              onChange={(patch) => updateCondition(condition.id, patch)}
              onRemove={
                condition.locked ? undefined : () => removeCondition(condition.id)
              }
            />
          </AutomationStep>
        ))}

        <AutomationStep
          kind="action"
          index={actionIndex}
          isLast
          title="Send a WhatsApp template"
          subtitle={`${action.templateName} · ${action.templateLanguage}`}
        >
          <ActionStep
            action={action}
            onChange={(patch) => setAction((prev) => ({ ...prev, ...patch }))}
          />
        </AutomationStep>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={addCondition}>
          <Plus />
          Add condition
        </Button>

        <NotYet title="Saving automations is not connected yet — this is a preview.">
          <Button variant="accent" size="sm" disabled>
            Create automation
          </Button>
        </NotYet>
      </div>
    </div>
  );
}
