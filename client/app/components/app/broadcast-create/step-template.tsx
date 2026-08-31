import { Link } from "react-router";
import { MessageSquare } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/app/empty-state";
import { Skeleton } from "~/components/ui/skeleton";
import { TemplatePreview } from "~/components/app/whatsapp/template-preview";
import { useChannels } from "~/hooks/use-channel-queries";
import { SAMPLE_TEMPLATES } from "~/lib/campaigns-placeholder-data";

interface StepTemplateProps {
  value: string | null;
  onChange: (templateName: string) => void;
}

/**
 * Step 2 — which approved template to send.
 *
 * The channel check here is real, not sample: `useChannels()` hits the live
 * endpoint, and the link out to Settings reaches the genuine Meta Embedded
 * Signup flow. It is the one working action in this composer, so it is worth
 * surfacing properly rather than as another disabled control.
 */
export function StepTemplate({ value, onChange }: StepTemplateProps) {
  const { data: channels, isLoading } = useChannels();

  const whatsappConnected = channels?.some(
    (channel) => channel.platform === "WHATSAPP" && channel.status === "CONNECTED",
  );

  const selected = SAMPLE_TEMPLATES.find((t) => t.name === value);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!whatsappConnected) {
    return (
      <div className="py-6">
        <EmptyState
          icon={MessageSquare}
          title="No WhatsApp channel connected"
          description="Templates are approved on Meta's side and read from the connected WhatsApp Business account. Connect one to see yours."
          action={
            <Button asChild variant="accent" size="sm">
              <Link to="/settings/channels">Connect WhatsApp</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-label text-muted-foreground">Message template</Label>
        <Select value={value ?? undefined} onValueChange={onChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose an approved template" />
          </SelectTrigger>
          <SelectContent>
            {SAMPLE_TEMPLATES.map((template) => {
              const isApproved = template.status === "APPROVED";

              return (
                /* Meta rejects unapproved templates outright with error 132,
                   so this is a genuine constraint, not a scaffold limitation. */
                <SelectItem
                  key={template.name}
                  value={template.name}
                  disabled={!isApproved}
                >
                  {template.name} · {template.language}
                  {!isApproved && ` — ${template.status.toLowerCase()}`}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <p className="text-caption text-muted-foreground">
          Only templates Meta has approved can be sent.
        </p>
      </div>

      {selected && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{selected.category}</Badge>
            <Badge variant="secondary">{selected.status}</Badge>
          </div>
          <TemplatePreview template={selected} />
        </div>
      )}
    </div>
  );
}
