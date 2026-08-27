import type { ReactNode } from "react";
import { Lock } from "lucide-react";

import { SectionCard } from "~/components/app/section-card";

export type AutomationStepKind = "trigger" | "condition" | "action";

const KIND_LABELS: Record<AutomationStepKind, string> = {
  trigger: "When",
  condition: "If",
  action: "Then",
};

interface AutomationStepProps {
  kind: AutomationStepKind;
  /** 1-based position, rendered in the numbered chip. */
  index: number;
  /** Suppresses the connector line below the card. */
  isLast: boolean;
  title: string;
  subtitle?: string;
  /** Renders a lock and dims the controls — the rule is fixed in code. */
  locked?: boolean;
  helpText?: string;
  children: ReactNode;
}

/**
 * One card in the vertical automation flow, plus the connector to the next.
 *
 * This is the whole "flow engine". A node canvas would need a new dependency
 * (there is no reactflow in the project) to express a chain that never
 * branches, so the steps stack and a 1px rule joins them.
 */
export function AutomationStep({
  kind,
  index,
  isLast,
  title,
  subtitle,
  locked,
  helpText,
  children,
}: AutomationStepProps) {
  return (
    <div className="relative pb-8">
      <SectionCard
        title={title}
        description={subtitle}
        icon={
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-ink text-micro font-semibold text-brand">
              {index}
            </span>
            <span className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">
              {KIND_LABELS[kind]}
            </span>
            {locked && <Lock className="size-3 text-muted-foreground" />}
          </div>
        }
      >
        <div className="space-y-3 p-5">
          {children}
          {helpText && (
            <p className="text-caption text-muted-foreground">{helpText}</p>
          )}
        </div>
      </SectionCard>

      {/* Connector into the next step. Decorative — the order is already
          conveyed by the numbered chips and the document flow. */}
      {!isLast && (
        <span
          className="absolute bottom-0 left-8 h-8 w-px bg-border"
          aria-hidden
        />
      )}
    </div>
  );
}
