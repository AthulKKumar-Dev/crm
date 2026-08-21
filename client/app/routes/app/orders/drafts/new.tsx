import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { OfflineOrderForm } from "~/components/app/order-create/offline-order-form";

export function meta() {
  return [
    { title: "New draft | Collabo CRM" },
    {
      name: "description",
      content: "Compose a draft order or quote. Save it now, complete later.",
    },
  ];
}

/**
 * Dedicated "New draft" page. Reuses the same form as `/orders/new` but
 * with `draftOnly` set — the Create-immediately button is hidden so the
 * only path forward is to save the work as a draft.
 */
export default function NewDraftPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/orders/drafts"
            className="mb-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100"
          >
            <ArrowLeft className="size-3.5" />
            Back to drafts
          </Link>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            New draft
          </h1>
          <p className="text-sm text-muted-foreground">
            Compose an in-progress order. Save now, edit anytime, then complete
            to turn it into a real order.
          </p>
        </div>
      </div>

      <OfflineOrderForm draftOnly />
    </div>
  );
}
