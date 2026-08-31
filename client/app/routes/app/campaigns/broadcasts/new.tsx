import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
} from "~/components/ui/page-header";
import { BroadcastComposer } from "~/components/app/broadcast-create/broadcast-composer";

export function meta() {
  return [{ title: "New broadcast | Collabo CRM" }];
}

export default function NewBroadcastPage() {
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
          <PageHeaderTitle>New broadcast</PageHeaderTitle>
          <PageHeaderDescription>
            Send an approved WhatsApp template to a saved audience.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <BroadcastComposer />
    </div>
  );
}
