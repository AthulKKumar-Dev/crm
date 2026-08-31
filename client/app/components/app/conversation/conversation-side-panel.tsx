import { SegmentedTabs } from "~/components/app/segmented-tabs";
import { cn } from "~/lib/utils";
import type { StagedProduct } from "~/lib/product-drag";
import type { ConversationDetail } from "~/types/api";

import { CatalogPanel } from "./catalog-panel";
import { CustomerPanel } from "./customer-panel";

export type PanelTab = "details" | "catalog";

const TABS = [
  { value: "details" as const, label: "Details" },
  { value: "catalog" as const, label: "Catalog" },
];

/**
 * The right column — customer context, or the product catalogue.
 *
 * A thin wrapper rather than tabs bolted inside CustomerPanel: the two tabs
 * have nothing in common beyond occupying the same 272px, and one of them
 * (Catalog) is not about the customer at all. Keeping CustomerPanel a pure
 * details renderer means it stays usable anywhere else that needs it.
 *
 * Uses the app's existing SegmentedTabs with `behaviour="tabs"`, which wires
 * the tablist/tab/tabpanel roles — hence the matching `id` and `role` below.
 */
export function ConversationSidePanel({
  conversation,
  tab,
  onTabChange,
  onAddNote,
  isSavingNote,
  onAddProduct,
  className,
}: {
  conversation: ConversationDetail;
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onAddNote: (body: string) => void;
  isSavingNote: boolean;
  onAddProduct: (staged: StagedProduct) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="shrink-0 border-b p-3">
        <SegmentedTabs
          items={TABS}
          value={tab}
          onChange={onTabChange}
          ariaLabel="Conversation side panel"
          behaviour="tabs"
          idPrefix="conv-panel"
          className="w-full"
        />
      </div>

      {tab === "details" ? (
        <CustomerPanel
          key="details"
          id="conv-panel-panel-details"
          role="tabpanel"
          aria-labelledby="conv-panel-tab-details"
          conversation={conversation}
          onAddNote={onAddNote}
          isSavingNote={isSavingNote}
          className="flex-1"
        />
      ) : (
        <CatalogPanel
          key="catalog"
          id="conv-panel-panel-catalog"
          role="tabpanel"
          aria-labelledby="conv-panel-tab-catalog"
          currency={conversation.insights.currency}
          onAdd={onAddProduct}
          className="flex-1"
        />
      )}
    </div>
  );
}
