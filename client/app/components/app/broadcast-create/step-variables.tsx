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
  MERGE_FIELDS,
  type WhatsAppTemplate,
  type WhatsAppTemplateVariable,
} from "~/lib/campaigns-placeholder-data";

interface StepVariablesProps {
  template: WhatsAppTemplate;
  variables: WhatsAppTemplateVariable[];
  onChange: (variables: WhatsAppTemplateVariable[]) => void;
}

const LITERAL = "__literal__";

/**
 * Step 3 — fill the template's {{n}} placeholders.
 *
 * Each row maps a placeholder to a merge field, or to a fixed string. The
 * preview beside it re-renders on every keystroke, which is the only reliable
 * way to catch a placeholder nobody mapped.
 */
export function StepVariables({
  template,
  variables,
  onChange,
}: StepVariablesProps) {
  function update(index: number, patch: Partial<WhatsAppTemplateVariable>) {
    onChange(
      variables.map((variable) =>
        variable.index === index ? { ...variable, ...patch } : variable,
      ),
    );
  }

  if (template.variables.length === 0) {
    return (
      <p className="text-body text-muted-foreground">
        <span className="font-medium text-foreground">{template.name}</span> has no
        variables — it sends exactly as approved.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        {variables.map((variable) => (
          <div key={variable.index} className="space-y-1.5">
            <Label className="text-label text-muted-foreground">
              Placeholder {`{{${variable.index}}}`}
            </Label>
            <Select
              value={variable.mappedTo ?? LITERAL}
              onValueChange={(next) =>
                update(variable.index, {
                  mappedTo: next === LITERAL ? null : next,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MERGE_FIELDS.map((field) => (
                  <SelectItem key={field.value} value={field.value}>
                    {field.label}
                  </SelectItem>
                ))}
                <SelectItem value={LITERAL}>Fixed text</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={variable.sampleValue}
              onChange={(event) =>
                update(variable.index, { sampleValue: event.target.value })
              }
              placeholder={
                variable.mappedTo ? "Example value for the preview" : "Fixed text"
              }
            />
            <p className="text-caption text-muted-foreground">
              {variable.mappedTo
                ? "Replaced per recipient when the message is built. The value above only feeds the preview."
                : "Sent to every recipient exactly as typed."}
            </p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-label text-muted-foreground">Preview</p>
        <TemplatePreview template={template} variables={variables} />
      </div>
    </div>
  );
}
