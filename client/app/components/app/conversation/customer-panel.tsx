import type { ReactNode } from "react";
import { Package } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/components/ui/button";
import {
  FINANCIAL_CLASSES,
  FINANCIAL_LABELS,
  FULFILLMENT_LABELS,
} from "~/lib/order-status";
import { cn, formatCurrency } from "~/lib/utils";
import type { ConversationDetail, InternalNote } from "~/types/api";

import { CustomerPanelActions } from "./customer-panel-actions";
import { PanelNotes } from "./panel-notes";

/**
 * A titled block inside the panel.
 *
 * Same shape as RailSection in orders/customers/$id.tsx — one card with
 * hairline dividers, the parent supplying `divide-y`. Copied rather than
 * imported because that one is route-local; extracting it into a shared
 * component is a worthwhile follow-up but touches a file outside this feature.
 */
function PanelSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        {/* Small-caps section label — the order-activity.tsx idiom. */}
        <h3 className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** Column 4 — commerce context for the person in the thread. */
export function CustomerPanel({
  conversation,
  onAddNote,
  isSavingNote,
  className,
  ...rest
}: {
  conversation: ConversationDetail;
  onAddNote: (body: string) => void;
  isSavingNote: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  const { insights, customer, notes } = conversation;
  const { currency, lifetimeSpend, ordersCount, lastOrder } = insights;

  return (
    <aside
      aria-label="Customer details"
      className={cn("min-h-0 divide-y overflow-y-auto", className)}
      {...rest}
    >
      <div className="grid grid-cols-2 divide-x">
        <div className="px-4 py-4">
          <p className="text-micro uppercase tracking-wider text-muted-foreground">
            Lifetime spend
          </p>
          <p className="mt-1 text-section text-foreground">
            {formatCurrency(lifetimeSpend, currency, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="px-4 py-4">
          <p className="text-micro uppercase tracking-wider text-muted-foreground">
            Orders
          </p>
          <p className="mt-1 text-section text-foreground tabular-nums">
            {ordersCount}
          </p>
        </div>
      </div>

      <PanelSection
        title="Last order"
        action={
          customer.customerId && (
            <Button variant="link" size="xs" asChild className="h-auto p-0">
              <Link to={`/orders/customers/${customer.customerId}`}>View All</Link>
            </Button>
          )
        }
      >
        {lastOrder ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Link
                to={`/orders/${lastOrder.id}`}
                className="text-caption font-medium text-foreground hover:underline"
              >
                {lastOrder.name}
              </Link>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-micro font-medium",
                  FINANCIAL_CLASSES[lastOrder.financialStatus],
                )}
              >
                {FINANCIAL_LABELS[lastOrder.financialStatus]}
              </span>
            </div>

            {lastOrder.items.map((item, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <Package className="size-4 text-muted-foreground" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-caption text-foreground">{item.title}</p>
                  <p className="text-micro text-muted-foreground">
                    {[item.variantTitle, `Qty ${item.quantity}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 text-caption tabular-nums text-foreground">
                  {formatCurrency(item.price, currency, { maximumFractionDigits: 0 })}
                </span>
              </div>
            ))}

            <div className="flex items-center justify-between gap-2 border-t pt-2 text-micro text-muted-foreground">
              <span>
                {[
                  FULFILLMENT_LABELS[lastOrder.fulfillmentStatus],
                  lastOrder.shipping?.etaLabel,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="text-caption font-medium text-foreground tabular-nums">
                {formatCurrency(lastOrder.totalPrice, currency, {
                  maximumFractionDigits: 0,
                })}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-caption text-muted-foreground">No orders yet.</p>
        )}
      </PanelSection>

      <PanelSection title="Actions">
        <CustomerPanelActions customer={customer} lastOrder={lastOrder} />
      </PanelSection>

      <PanelSection title="Internal notes">
        <PanelNotes
          notes={notes as InternalNote[]}
          onAddNote={onAddNote}
          isSaving={isSavingNote}
        />
      </PanelSection>
    </aside>
  );
}
