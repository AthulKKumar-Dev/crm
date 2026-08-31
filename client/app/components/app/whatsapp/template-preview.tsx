import type {
  WhatsAppTemplate,
  WhatsAppTemplateVariable,
} from "~/lib/campaigns-placeholder-data";
import { cn } from "~/lib/utils";

interface TemplatePreviewProps {
  template: WhatsAppTemplate;
  /**
   * Overrides `template.variables` while the composer is being edited, so the
   * bubble updates as the merge fields are mapped. Falls back to the template's
   * own sample values everywhere else.
   */
  variables?: WhatsAppTemplateVariable[];
  className?: string;
}

/**
 * Substitutes {{1}}, {{2}}… with whatever the variable row currently resolves
 * to. An unmapped placeholder is left visible rather than blanked — a preview
 * showing a gap where a name should be is how unmapped variables get shipped.
 */
function renderBody(body: string, variables: WhatsAppTemplateVariable[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (placeholder, rawIndex: string) => {
    const variable = variables.find((v) => v.index === Number(rawIndex));
    return variable?.sampleValue?.trim() ? variable.sampleValue : placeholder;
  });
}

/**
 * A read-only approximation of how the template lands in WhatsApp.
 *
 * Deliberately not WhatsApp green: this is a preview inside the CRM, and
 * borrowing the real chat colours would read as a live conversation view.
 */
export function TemplatePreview({
  template,
  variables,
  className,
}: TemplatePreviewProps) {
  const resolved = variables ?? template.variables;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="max-w-sm rounded-lg rounded-br-sm bg-muted p-3">
        {template.headerText && (
          <p className="mb-1 text-label text-foreground">{template.headerText}</p>
        )}
        <p className="text-body whitespace-pre-line text-foreground">
          {renderBody(template.body, resolved)}
        </p>
        {template.footerText && (
          <p className="mt-2 text-micro text-muted-foreground">
            {template.footerText}
          </p>
        )}
      </div>
      <p className="text-micro text-muted-foreground">
        {template.name} · {template.language}
      </p>
    </div>
  );
}
