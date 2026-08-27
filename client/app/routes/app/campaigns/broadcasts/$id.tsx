import { Link, useParams } from "react-router";
import { ArrowLeft, Send } from "lucide-react";

import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderActions,
} from "~/components/ui/page-header";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { SectionCard } from "~/components/app/section-card";
import { EmptyState } from "~/components/app/empty-state";
import { NotYet } from "~/components/app/not-yet";
import { DeliveryBreakdown } from "~/components/app/whatsapp/delivery-breakdown";
import { MessageLogTable } from "~/components/app/whatsapp/message-log-table";
import { TemplatePreview } from "~/components/app/whatsapp/template-preview";
import {
  SAMPLE_BROADCASTS,
  SAMPLE_BROADCAST_LOGS,
  SAMPLE_TEMPLATES,
} from "~/lib/campaigns-placeholder-data";
import {
  BROADCAST_STATUS_CLASSES,
  BROADCAST_STATUS_LABELS,
} from "~/lib/whatsapp-status";
import { formatDateTime } from "~/lib/format-date";
import { cn } from "~/lib/utils";

export function meta() {
  return [{ title: "Broadcast | Collabo CRM" }];
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="text-body text-right text-foreground">{value}</p>
    </div>
  );
}

export default function BroadcastDetailPage() {
  const { id } = useParams();
  const broadcast = SAMPLE_BROADCASTS.find((b) => b.id === id);

  // No QueryErrorState here — nothing was fetched, so there is nothing to retry.
  if (!broadcast) {
    return (
      <div className="py-12">
        <EmptyState
          icon={Send}
          title="Broadcast not found"
          description="This broadcast does not exist in the sample data."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/campaigns/broadcasts">Back to broadcasts</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const template = SAMPLE_TEMPLATES.find(
    (t) => t.name === broadcast.templateName,
  );
  const logs = SAMPLE_BROADCAST_LOGS[broadcast.id] ?? [];

  return (
    <div className="space-y-6">
      <Link
        to="/campaigns/broadcasts"
        className="inline-flex items-center gap-1.5 text-caption text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to broadcasts
      </Link>

      <PageHeader>
        <PageHeaderContent>
          <div className="flex flex-wrap items-center gap-2">
            <PageHeaderTitle>{broadcast.name}</PageHeaderTitle>
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-caption font-semibold",
                BROADCAST_STATUS_CLASSES[broadcast.status],
              )}
            >
              {BROADCAST_STATUS_LABELS[broadcast.status]}
            </span>
          </div>
          <PageHeaderDescription>
            {broadcast.audience.label} ·{" "}
            {broadcast.recipients.toLocaleString()} recipients
          </PageHeaderDescription>
        </PageHeaderContent>

        {/* A sent or failed broadcast gets no actions at all. Nothing about it
            is re-sendable, and a "resend to failed" control would read as if it
            were. */}
        <PageHeaderActions>
          {broadcast.status === "draft" && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link to="/campaigns/broadcasts/new">Edit in composer</Link>
              </Button>
              <NotYet title="Broadcast sending is not connected yet.">
                <Button variant="accent" size="sm" disabled>
                  Send now
                </Button>
              </NotYet>
            </>
          )}
          {broadcast.status === "scheduled" && (
            <NotYet title="Scheduling is not connected yet.">
              <Button variant="outline" size="sm" disabled>
                Cancel schedule
              </Button>
            </NotYet>
          )}
        </PageHeaderActions>
      </PageHeader>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-2 space-y-6">
          <SectionCard
            title="Delivery"
            description="Each message sits in exactly one state, so these five add up to the whole."
          >
            <div className="p-5">
              <DeliveryBreakdown
                counts={broadcast.counts}
                total={broadcast.recipients}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Message log"
            description="One row per WhatsApp message, as the send worker records it."
          >
            <MessageLogTable
              rows={logs}
              emptyDescription="This broadcast has not started sending, so no messages have been logged."
            />
          </SectionCard>
        </div>

        <div className="flex-1 space-y-6">
          <SectionCard title="Template">
            <div className="space-y-3 p-5">
              {template ? (
                <>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{template.category}</Badge>
                    <Badge variant="secondary">{template.status}</Badge>
                  </div>
                  <TemplatePreview template={template} />
                </>
              ) : (
                <p className="text-body text-muted-foreground">
                  {broadcast.templateName} · {broadcast.templateLanguage}
                </p>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Audience">
            <div className="p-5">
              <p className="text-body text-foreground">
                {broadcast.audience.label}
              </p>
              <p className="mt-1 text-caption text-muted-foreground">
                {broadcast.audience.description}
              </p>
              <p className="mt-3 text-stat tabular-nums text-foreground">
                {broadcast.audience.size.toLocaleString()}
              </p>
              <p className="text-caption text-muted-foreground">
                contacts in this audience
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Schedule">
            <div className="divide-y divide-border px-5 py-1">
              <DetailRow label="Created by" value={broadcast.createdBy} />
              <DetailRow
                label="Created"
                value={formatDateTime(broadcast.createdAt)}
              />
              <DetailRow
                label="Scheduled for"
                value={formatDateTime(broadcast.scheduledFor)}
              />
              <DetailRow label="Sent" value={formatDateTime(broadcast.sentAt)} />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
