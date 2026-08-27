import { Link } from "react-router";
import { Plus } from "lucide-react";

import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderActions,
} from "~/components/ui/page-header";
import { Button } from "~/components/ui/button";
import { SectionCard } from "~/components/app/section-card";
import { AutomationRow } from "~/components/app/automation-builder/automation-row";
import { SAMPLE_AUTOMATIONS } from "~/lib/campaigns-placeholder-data";

export function meta() {
  return [{ title: "Automations | Collabo CRM" }];
}

/**
 * Automations list.
 *
 * The create flow at `/campaigns/automations/new` is a preview: it assembles a
 * rule in local state and shows the shape one takes, but the terminal button is
 * inert because nothing persists or executes it yet. The banner below says so,
 * and it names the one rule on this page that genuinely runs.
 */
export default function AutomationsPage() {
  return (
    <div className="space-y-6">
      {/* Wording differs from the other Campaigns pages on purpose — the blanket
          "all sample data" line would be false here. */}
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Automations</PageHeaderTitle>
          <PageHeaderDescription>
            Rules that send a WhatsApp message when something happens in your
            store.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button asChild variant="accent" size="sm">
            <Link to="/campaigns/automations/new">
              <Plus />
              New automation
            </Link>
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <SectionCard
        title="All automations"
        description="Each rule runs on its own trigger."
      >
        <div className="divide-y divide-border">
          {SAMPLE_AUTOMATIONS.map((automation) => (
            <AutomationRow key={automation.id} automation={automation} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
