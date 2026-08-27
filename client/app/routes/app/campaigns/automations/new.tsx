import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
} from "~/components/ui/page-header";
import { AutomationForm } from "~/components/app/automation-builder/automation-form";

export function meta() {
  return [{ title: "New automation | Collabo CRM" }];
}

export default function NewAutomationPage() {
  return (
    <div className="space-y-6">
      <Link
        to="/campaigns/automations"
        className="inline-flex items-center gap-1.5 text-caption text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to automations
      </Link>

      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>New automation</PageHeaderTitle>
          <PageHeaderDescription>
            Send a WhatsApp template automatically when something happens in your
            store.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <AutomationForm />
    </div>
  );
}
