import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "~/components/ui/button";
import { SectionCard } from "~/components/app/section-card";
import { NotYet } from "~/components/app/not-yet";
import { COMPOSER_STEPS, ComposerSteps } from "./composer-steps";
import { StepAudience } from "./step-audience";
import { StepTemplate } from "./step-template";
import { StepVariables } from "./step-variables";
import { StepReview, type BroadcastTiming } from "./step-review";
import {
  SAMPLE_AUDIENCES,
  SAMPLE_TEMPLATES,
  type WhatsAppTemplateVariable,
} from "~/lib/campaigns-placeholder-data";

/**
 * Everything the composer collects. It never leaves this component — there is
 * no draft endpoint, and persisting to localStorage would create a "saved"
 * broadcast the rest of the app knows nothing about.
 */
interface BroadcastDraft {
  audienceId: string | null;
  templateName: string | null;
  variables: WhatsAppTemplateVariable[];
  timing: BroadcastTiming;
  scheduledFor: string;
}

const INITIAL_DRAFT: BroadcastDraft = {
  audienceId: null,
  templateName: null,
  variables: [],
  timing: "now",
  scheduledFor: "",
};

/**
 * The four-step WhatsApp broadcast composer.
 *
 * Nothing here sends, schedules or saves. The terminal button is deliberately
 * inert rather than firing a toast or routing to a detail page: either would
 * simulate a state change that did not happen, which is worse than an obviously
 * disabled control.
 */
export function BroadcastComposer() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<BroadcastDraft>(INITIAL_DRAFT);

  const audience = SAMPLE_AUDIENCES.find((a) => a.id === draft.audienceId);
  const template = SAMPLE_TEMPLATES.find((t) => t.name === draft.templateName);

  /** Seeds the variable rows from the template's own approved placeholders. */
  function handleTemplateChange(templateName: string) {
    const next = SAMPLE_TEMPLATES.find((t) => t.name === templateName);
    setDraft((prev) => ({
      ...prev,
      templateName,
      variables: next ? next.variables.map((v) => ({ ...v })) : [],
    }));
  }

  const canAdvance =
    (step === 0 && !!audience) ||
    (step === 1 && !!template) ||
    step === 2 ||
    step === 3;

  const isLastStep = step === COMPOSER_STEPS.length - 1;

  return (
    <div className="space-y-5">
      <ComposerSteps current={step} onSelect={setStep} />

      <SectionCard
        title={COMPOSER_STEPS[step]}
        description={
          [
            "Pick who receives this broadcast.",
            "Pick the Meta-approved template to send.",
            "Fill in the template placeholders.",
            "Choose when it goes out and check it over.",
          ][step]
        }
      >
        <div className="p-5">
          {step === 0 && (
            <StepAudience
              value={draft.audienceId}
              onChange={(audienceId) =>
                setDraft((prev) => ({ ...prev, audienceId }))
              }
            />
          )}

          {step === 1 && (
            <StepTemplate
              value={draft.templateName}
              onChange={handleTemplateChange}
            />
          )}

          {step === 2 &&
            (template ? (
              <StepVariables
                template={template}
                variables={draft.variables}
                onChange={(variables) =>
                  setDraft((prev) => ({ ...prev, variables }))
                }
              />
            ) : (
              <p className="text-body text-muted-foreground">
                Choose a template first.
              </p>
            ))}

          {step === 3 &&
            (audience && template ? (
              <StepReview
                audience={audience}
                template={template}
                variables={draft.variables}
                timing={draft.timing}
                scheduledFor={draft.scheduledFor}
                onTimingChange={(timing) =>
                  setDraft((prev) => ({ ...prev, timing }))
                }
                onScheduledForChange={(scheduledFor) =>
                  setDraft((prev) => ({ ...prev, scheduledFor }))
                }
              />
            ) : (
              <p className="text-body text-muted-foreground">
                Pick an audience and a template to see the review.
              </p>
            ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-5 py-4">
          <Button
            variant="outline"
            size="sm"
            disabled={step === 0}
            onClick={() => setStep((prev) => Math.max(0, prev - 1))}
          >
            <ChevronLeft />
            Back
          </Button>

          {isLastStep ? (
            <NotYet title="Broadcast sending is not connected yet — this is a preview.">
              <Button variant="accent" size="sm" disabled>
                {draft.timing === "now" ? "Send broadcast" : "Schedule broadcast"}
              </Button>
            </NotYet>
          ) : (
            <Button
              variant="accent"
              size="sm"
              disabled={!canAdvance}
              onClick={() =>
                setStep((prev) => Math.min(COMPOSER_STEPS.length - 1, prev + 1))
              }
            >
              Next
              <ChevronRight />
            </Button>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
