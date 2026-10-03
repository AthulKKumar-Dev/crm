/**
 * "Orders in this batch" — one slip per ticked order.
 *
 * Unticking is for this print only: it is how an order with no address is left
 * out without going back to the orders list and re-selecting the other 39.
 */
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { readAddress } from "~/lib/address";
import { cn } from "~/lib/utils";
import type { OrderSlipData } from "~/types/api";

export function SlipOrderRows({
  orders,
  excluded,
  onToggle,
}: {
  orders: OrderSlipData[];
  excluded: ReadonlySet<string>;
  onToggle: (orderId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {orders.map((o, i) => {
        const ship = readAddress(o.shippingAddress);
        const name =
          ship.name ||
          [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(" ");
        const units = o.lineItems.reduce((n, li) => n + li.quantity, 0);
        // The tail of the address — city, state, country — whichever of them
        // the order has. `lines` does not say which line is which.
        const place = ship.lines.slice(-2).join(", ");
        return (
          <label
            key={o.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/60",
              i < orders.length - 1 && "border-b border-border",
              !ship.hasAddress && "bg-muted/40",
            )}
          >
            <Checkbox checked={!excluded.has(o.id)} onCheckedChange={() => onToggle(o.id)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label text-foreground">
                {[o.name, name].filter(Boolean).join(" · ")}
              </span>
              <span className="block truncate text-caption text-muted-foreground">
                {ship.hasAddress
                  ? `${place} · ${units} item${units === 1 ? "" : "s"}`
                  : "No shipping address"}
              </span>
            </span>
            {!ship.hasAddress && (
              <Badge className="flex-none bg-warning-subtle text-warning-strong">
                Address missing
              </Badge>
            )}
          </label>
        );
      })}
    </div>
  );
}
