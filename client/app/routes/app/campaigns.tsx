import { Link } from "react-router";
import { Plus } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

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
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import { SectionCard } from "~/components/app/section-card";
import { StatCard } from "~/components/app/stat-card";
import { AutomationRow } from "~/components/app/automation-builder/automation-row";
import {
  CAMPAIGN_OVERVIEW_STATS,
  DELIVERY_TREND_DATA,
  SAMPLE_AUTOMATIONS,
  SAMPLE_BROADCASTS,
} from "~/lib/campaigns-placeholder-data";
import {
  BROADCAST_STATUS_CLASSES,
  BROADCAST_STATUS_LABELS,
} from "~/lib/whatsapp-status";
import { formatDateTime } from "~/lib/format-date";
import { cn } from "~/lib/utils";

export function meta() {
  return [{ title: "Campaigns | Collabo CRM" }];
}

/** Tones come from the token layer — never a raw hex in a chart prop. */
const TREND_CONFIG = {
  delivered: { label: "Delivered", color: "var(--brand)" },
  read: { label: "Read", color: "var(--success)" },
} satisfies ChartConfig;

export default function CampaignsPage() {
  const recentBroadcasts = SAMPLE_BROADCASTS.slice(0, 4);

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Campaigns</PageHeaderTitle>
          <PageHeaderDescription>
            WhatsApp broadcasts and automations, and how they are landing.
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
        {CAMPAIGN_OVERVIEW_STATS.map((stat, index, all) => (
          <div key={stat.label} className="flex items-center gap-4">
            <StatCard
              variant="inline"
              label={stat.label}
              value={stat.value}
              change={stat.change}
              changeLabel={stat.changeLabel}
              className="flex-1"
            />
            {index < all.length - 1 && (
              <Separator orientation="vertical" className="hidden h-15 md:block" />
            )}
          </div>
        ))}
      </div>

      <SectionCard
        title="Recent broadcasts"
        description="The four most recent one-off sends."
        action={
          <Link
            to="/campaigns/broadcasts"
            className="text-caption font-medium text-brand-strong hover:text-brand-strong-hover"
          >
            View all
          </Link>
        }
      >
        <div className="divide-y divide-border">
          {recentBroadcasts.map((broadcast) => (
            <Link
              key={broadcast.id}
              to={`/campaigns/broadcasts/${broadcast.id}`}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-50 flex-1">
                <p className="text-body font-medium text-foreground">
                  {broadcast.name}
                </p>
                <p className="text-caption text-muted-foreground">
                  {broadcast.audience.label} ·{" "}
                  {broadcast.recipients.toLocaleString()} recipients
                </p>
              </div>
              <div className="text-right">
                <p className="text-caption text-muted-foreground">
                  {broadcast.counts.delivered.toLocaleString()} delivered ·{" "}
                  {broadcast.counts.read.toLocaleString()} read
                </p>
                <p className="text-caption text-muted-foreground">
                  {formatDateTime(broadcast.sentAt ?? broadcast.scheduledFor)}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex rounded-full px-2 py-0.5 text-caption font-semibold",
                  BROADCAST_STATUS_CLASSES[broadcast.status],
                )}
              >
                {BROADCAST_STATUS_LABELS[broadcast.status]}
              </span>
            </Link>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Automations"
        description="Rules that send on their own when something happens."
        action={
          <Link
            to="/campaigns/automations"
            className="text-caption font-medium text-brand-strong hover:text-brand-strong-hover"
          >
            View all
          </Link>
        }
      >
        <div className="divide-y divide-border">
          {SAMPLE_AUTOMATIONS.slice(0, 3).map((automation) => (
            <AutomationRow
              key={automation.id}
              automation={automation}
              showToggle={false}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Delivery trend"
        description="Share of messages delivered and read over the last seven months."
      >
        <div className="p-5">
          <ChartContainer config={TREND_CONFIG} className="aspect-auto h-56 w-full">
            {/* All four sides: recharts replaces this object rather than merging
                it with its default, so an omitted side becomes 0 and clips the
                stroke against the SVG edge. */}
            <LineChart data={DELIVERY_TREND_DATA} margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis
                tickLine={false}
                axisLine={false}
                unit="%"
                width={40}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey="delivered"
                type="monotone"
                stroke="var(--color-delivered)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="read"
                type="monotone"
                stroke="var(--color-read)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </div>
      </SectionCard>
    </div>
  );
}
