import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Plus, Send } from "lucide-react";

import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderActions,
} from "~/components/ui/page-header";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { SectionCard } from "~/components/app/section-card";
import { SegmentedTabs } from "~/components/app/segmented-tabs";
import { StatCard } from "~/components/app/stat-card";
import { EmptyState } from "~/components/app/empty-state";
import {
  SAMPLE_BROADCASTS,
  type BroadcastStatus,
} from "~/lib/campaigns-placeholder-data";
import {
  BROADCAST_STATUS_CLASSES,
  BROADCAST_STATUS_LABELS,
  BROADCAST_STATUS_ORDER,
  WA_STATUS_LABELS,
  WA_STATUS_ORDER,
} from "~/lib/whatsapp-status";
import { formatDateTime } from "~/lib/format-date";
import { cn } from "~/lib/utils";

export function meta() {
  return [{ title: "Broadcasts | Collabo CRM" }];
}

type StatusFilter = "all" | BroadcastStatus;

const SUMMARY_STATS = [
  { label: "Messages sent (30d)", value: "3,283" },
  { label: "Delivered", value: "1,288" },
  { label: "Read rate", value: "62.1%" },
  { label: "Failed", value: "279" },
];

export default function BroadcastsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filters = useMemo(
    () => [
      { value: "all" as const, label: "All", count: SAMPLE_BROADCASTS.length },
      ...BROADCAST_STATUS_ORDER.map((status) => ({
        value: status,
        label: BROADCAST_STATUS_LABELS[status],
        count: SAMPLE_BROADCASTS.filter((b) => b.status === status).length,
      })),
    ],
    [],
  );

  const broadcasts = useMemo(
    () =>
      statusFilter === "all"
        ? SAMPLE_BROADCASTS
        : SAMPLE_BROADCASTS.filter((b) => b.status === statusFilter),
    [statusFilter],
  );

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Broadcasts</PageHeaderTitle>
          <PageHeaderDescription>
            One-off WhatsApp sends to a saved audience.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button asChild variant="accent" size="sm">
            <Link to="/campaigns/broadcasts/new">
              <Plus />
              New broadcast
            </Link>
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <div className="grid grid-cols-1 gap-5 rounded-xl bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        {SUMMARY_STATS.map(({ label, value }, index, all) => (
          <div key={label} className="flex items-center gap-4">
            <StatCard variant="inline" label={label} value={value} className="flex-1" />
            {index < all.length - 1 && (
              <Separator orientation="vertical" className="hidden h-15 md:block" />
            )}
          </div>
        ))}
      </div>

      <SegmentedTabs
        behaviour="filter"
        ariaLabel="Filter broadcasts by status"
        items={filters}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      <SectionCard
        title="All broadcasts"
        description="Every broadcast, newest activity first."
      >
        {broadcasts.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Send}
              title="No broadcasts here"
              description="Nothing matches this filter yet."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Broadcast</TableHead>
                  <TableHead>Audience</TableHead>
                  {/* Recipients and the five count columns coexist on purpose:
                      for a draft every count is zero and Recipients — the
                      audience estimate — is the only informative cell. */}
                  <TableHead className="text-right">Recipients</TableHead>
                  {WA_STATUS_ORDER.map((status) => (
                    <TableHead key={status} className="text-right">
                      {WA_STATUS_LABELS[status]}
                    </TableHead>
                  ))}
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled for</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {broadcasts.map((broadcast) => (
                  <TableRow
                    key={broadcast.id}
                    className="cursor-pointer"
                    onClick={() =>
                      navigate(`/campaigns/broadcasts/${broadcast.id}`)
                    }
                  >
                    <TableCell>
                      <p className="text-body font-medium text-foreground">
                        {broadcast.name}
                      </p>
                      <p className="text-caption text-muted-foreground">
                        {broadcast.templateName} · {broadcast.templateLanguage}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-body text-foreground">
                        {broadcast.audience.label}
                      </p>
                      <p className="text-caption text-muted-foreground">
                        {broadcast.audience.size.toLocaleString()} contacts
                      </p>
                    </TableCell>
                    <TableCell className="text-right text-body tabular-nums text-foreground">
                      {broadcast.recipients.toLocaleString()}
                    </TableCell>
                    {WA_STATUS_ORDER.map((status) => (
                      <TableCell
                        key={status}
                        className={cn(
                          "text-right text-body tabular-nums",
                          status === "failed" && broadcast.counts.failed > 0
                            ? "text-danger"
                            : "text-muted-foreground",
                        )}
                      >
                        {broadcast.counts[status].toLocaleString()}
                      </TableCell>
                    ))}
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-caption font-semibold",
                          BROADCAST_STATUS_CLASSES[broadcast.status],
                        )}
                      >
                        {BROADCAST_STATUS_LABELS[broadcast.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-caption text-muted-foreground">
                      {formatDateTime(broadcast.scheduledFor ?? broadcast.sentAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
