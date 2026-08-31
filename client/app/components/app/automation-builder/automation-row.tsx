import { Link } from "react-router";
import { Send, Zap } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Switch } from "~/components/ui/switch";
import { NotYet } from "~/components/app/not-yet";
import {
  TRIGGER_LABELS,
  type Automation,
} from "~/lib/campaigns-placeholder-data";
import { formatDateTime } from "~/lib/format-date";

interface AutomationRowProps {
  automation: Automation;
  /** The overview page lists automations without offering the toggle. */
  showToggle?: boolean;
}

/**
 * One automation, shared by the automations list and the campaigns overview so
 * the two cannot drift.
 */
export function AutomationRow({
  automation,
  showToggle = true,
}: AutomationRowProps) {
  const isLive = automation.provenance === "live";
  const action = automation.actions[0];

  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50">
      <div className="min-w-60 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/campaigns/automations/${automation.id}`}
            className="text-body font-medium text-foreground hover:underline"
          >
            {automation.name}
          </Link>
          <Badge variant={isLive ? "default" : "outline"}>
            {isLive ? "Live" : "Sample"}
          </Badge>
        </div>
        <p className="mt-0.5 text-caption text-muted-foreground">
          {automation.description}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-caption text-muted-foreground">
          <Zap className="size-3" />
          {TRIGGER_LABELS[automation.trigger.type]}
        </span>
        {action && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-caption text-muted-foreground">
            <Send className="size-3" />
            WhatsApp · {action.templateName}
          </span>
        )}
      </div>

      <div className="text-right">
        <p className="text-caption text-muted-foreground">
          Last run {formatDateTime(automation.lastRunAt)}
        </p>
        <p className="text-caption text-muted-foreground">
          {automation.counts.delivered.toLocaleString()} delivered ·{" "}
          {automation.counts.failed.toLocaleString()} failed
        </p>
      </div>

      {showToggle && (
        <NotYet
          title={
            isLive
              ? "This automation is configured in code. Turning it off needs a settings change."
              : "Automations are not connected yet — this is a preview."
          }
        >
          <Switch checked={automation.enabled} disabled />
        </NotYet>
      )}
    </div>
  );
}
