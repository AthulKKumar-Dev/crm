import { Link, useParams } from "react-router";
import { ArrowLeft, Zap } from "lucide-react";

import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
} from "~/components/ui/page-header";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { SectionCard } from "~/components/app/section-card";
import { EmptyState } from "~/components/app/empty-state";
import { AutomationStep } from "~/components/app/automation-builder/automation-step";
import { TriggerStep } from "~/components/app/automation-builder/trigger-step";
import { ConditionStep } from "~/components/app/automation-builder/condition-step";
import { ActionStep } from "~/components/app/automation-builder/action-step";
import { MessageLogTable } from "~/components/app/whatsapp/message-log-table";
import {
  CONDITION_FIELD_LABELS,
  CONDITION_OPERATOR_LABELS,
  SAMPLE_AUTOMATIONS,
  SAMPLE_AUTOMATION_LOGS,
  TRIGGER_LABELS,
} from "~/lib/campaigns-placeholder-data";

export function meta() {
  return [{ title: "Automation | Collabo CRM" }];
}

export default function AutomationDetailPage() {
  const { id } = useParams();
  const automation = SAMPLE_AUTOMATIONS.find((a) => a.id === id);

  if (!automation) {
    return (
      <div className="py-12">
        <EmptyState
          icon={Zap}
          title="Automation not found"
          description="This automation does not exist in the sample data."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/campaigns/automations">Back to automations</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const isLive = automation.provenance === "live";

  // Trigger, then every condition, then every action — the flow's real order.
  const totalSteps = 1 + automation.conditions.length + automation.actions.length;

  return (
    <div className="space-y-6">
      <Link
        to="/campaigns/automations"
        className="inline-flex items-center gap-1.5 text-caption text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to automations
      </Link>

      <PageHeader>
        <PageHeaderContent>
          <div className="flex flex-wrap items-center gap-2">
            <PageHeaderTitle>{automation.name}</PageHeaderTitle>
            <Badge variant={isLive ? "default" : "outline"}>
              {isLive ? "Live" : "Sample"}
            </Badge>
          </div>
          <PageHeaderDescription>{automation.description}</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <div className="max-w-2xl">
        <AutomationStep
          kind="trigger"
          index={1}
          isLast={totalSteps === 1}
          title={TRIGGER_LABELS[automation.trigger.type]}
          subtitle={automation.trigger.source}
        >
          <TriggerStep value={automation.trigger.type} />
        </AutomationStep>

        {automation.conditions.map((condition, index) => (
          <AutomationStep
            key={condition.id}
            kind="condition"
            index={index + 2}
            /* Only true if an automation somehow has no action to follow. */
            isLast={
              automation.actions.length === 0 &&
              index === automation.conditions.length - 1
            }
            title={`${CONDITION_FIELD_LABELS[condition.field]} ${
              CONDITION_OPERATOR_LABELS[condition.operator]
            }`}
            locked={condition.locked}
            helpText={condition.helpText}
          >
            <ConditionStep condition={condition} />
          </AutomationStep>
        ))}

        {automation.actions.map((action, index) => (
          <AutomationStep
            key={action.id}
            kind="action"
            index={automation.conditions.length + 2 + index}
            isLast={index === automation.actions.length - 1}
            title="Send a WhatsApp template"
            subtitle={`${action.templateName} · ${action.templateLanguage}`}
          >
            <ActionStep action={action} />
          </AutomationStep>
        ))}
      </div>

      {/* Only the live automation has a genuine send history to show. */}
      {isLive && (
        <SectionCard
          title="Recent sends"
          description="The most recent messages this automation produced."
        >
          <MessageLogTable rows={SAMPLE_AUTOMATION_LOGS} />
        </SectionCard>
      )}
    </div>
  );
}
