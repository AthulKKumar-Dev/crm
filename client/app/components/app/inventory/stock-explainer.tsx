import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

import { CODE_TERMS, STOCK_TERMS } from "~/lib/inventory-vocabulary";
import { cn } from "~/lib/utils";
import type { StockStats } from "~/types/api";

/**
 * The one place the inventory model is explained to a merchant.
 *
 * Until this existed, the only merchant-facing description of the whole model
 * was a single sentence in the "enable warehousing" empty state — which nobody
 * sees twice. Support kept hearing "where do I update stock?" and "what do
 * these numbers mean?", and the answer lived only in code comments.
 *
 * Written in the house style used by the GST panels: name the actual figures on
 * screen rather than describing them in the abstract, and say which control to
 * use rather than "contact support". Starts collapsed so it stays out of the
 * way on every visit; opening it is not remembered.
 */
export function StockExplainer({
  locationName,
  locationCount,
  stats,
}: {
  locationName: string;
  locationCount: number;
  stats: StockStats | undefined;
}) {
  const [collapsed, setCollapsed] = useState(true);

  const toggle = () => setCollapsed((c) => !c);

  const unavailable = stats ? stats.unitsQc + stats.unitsDamaged : 0;

  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <HelpCircle className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-label font-medium text-foreground">
          How stock works here
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            !collapsed && "rotate-180",
          )}
        />
      </button>

      {!collapsed && (
        <div className="space-y-3 border-t border-border px-4 py-3.5">
          <div className="rounded-lg bg-info-subtle px-4 py-3 text-caption">
            <p>
              <strong className="font-semibold">
                Stock is counted separately at each location.
              </strong>{" "}
              You are looking at <strong className="font-semibold">{locationName}</strong>
              {locationCount > 1 && (
                <>
                  {" "}
                  — one of {locationCount}. Figures for the others are not
                  included here; switch with the location picker above
                </>
              )}
              . Every quantity on this page, and every edit you make, belongs to
              this location alone.
            </p>
          </div>

          {stats && (
            <div className="rounded-lg bg-muted px-4 py-3 text-caption">
              <p className="mb-1.5">
                <strong className="font-semibold">What the columns mean</strong>{" "}
                — at {locationName} right now:
              </p>
              <ul className="space-y-1">
                <li>
                  <strong className="font-semibold tabular-nums">
                    {stats.unitsAvailable.toLocaleString()} {STOCK_TERMS.available.label.toLowerCase()}
                  </strong>{" "}
                  — {STOCK_TERMS.available.definition}
                </li>
                <li>
                  <strong className="font-semibold tabular-nums">
                    {stats.unitsReserved.toLocaleString()} {STOCK_TERMS.committed.label.toLowerCase()}
                  </strong>{" "}
                  — {STOCK_TERMS.committed.definition}
                </li>
                <li>
                  <strong className="font-semibold tabular-nums">
                    {unavailable.toLocaleString()} {STOCK_TERMS.unavailable.label.toLowerCase()}
                  </strong>{" "}
                  — {STOCK_TERMS.unavailable.definition}
                </li>
                <li>
                  <strong className="font-semibold tabular-nums">
                    {stats.unitsOnHand.toLocaleString()} on hand
                  </strong>{" "}
                  — all of the above added together.
                </li>
              </ul>
            </div>
          )}

          <div className="rounded-lg bg-muted px-4 py-3 text-caption">
            <p>
              <strong className="font-semibold">To change a quantity</strong>, type
              in the {STOCK_TERMS.available.label} box on any row and press{" "}
              <span className="font-medium">Save changes</span> — you can edit
              several rows first, and they are saved together. Use{" "}
              <span className="font-medium">Adjust</span> when you need to record
              a reason, or to move units into or out of QC and damaged.
            </p>
          </div>

          {/* Codes sit with the stock figures because the buttons that create
              them sit in the same toolbar as this panel. They used to be
              explained nowhere at all. */}
          <div className="rounded-lg bg-muted px-4 py-3 text-caption">
            <p className="mb-1.5">
              <strong className="font-semibold">Codes and labels</strong>
            </p>
            <ul className="space-y-1">
              <li>
                <strong className="font-semibold">{CODE_TERMS.sku.label}</strong>{" "}
                — {CODE_TERMS.sku.definition}
              </li>
              <li>
                <strong className="font-semibold">
                  {CODE_TERMS.barcode.label}
                </strong>{" "}
                — {CODE_TERMS.barcode.definition}
              </li>
            </ul>
            <p className="mt-1.5">
              New products get both automatically. Use{" "}
              <span className="font-medium">Product codes</span> above to fill in
              anything older that is missing one.
            </p>
          </div>

          <div className="rounded-lg bg-warning-subtle px-4 py-3 text-caption">
            <p>
              <strong className="font-semibold">Shopify is the source of truth.</strong>{" "}
              Locations and their quantities sync from Shopify, and your edits
              here are pushed back to it. If the same quantity changes in both
              places, the next sync from Shopify wins — so make the change in one
              place and let it travel.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
