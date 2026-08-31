import { FileText, Link as LinkIcon, ShoppingBag, ShoppingCart } from "lucide-react";
import { Link } from "react-router";

import { NotYet } from "~/components/app/not-yet";
import { Button } from "~/components/ui/button";
import type { ConversationCustomer, ConversationLastOrder } from "~/types/api";

/**
 * The 2x2 action grid.
 *
 * Two of these are real and two are not, and the difference is deliberately
 * visible: the real ones are links into flows that already exist, the pending
 * ones are disabled under a NotYet tooltip that says what is missing. A button
 * that looks live and does nothing is worse than one that admits it.
 */
export function CustomerPanelActions({
  customer,
  lastOrder,
}: {
  customer: ConversationCustomer;
  lastOrder: ConversationLastOrder | null;
}) {
  const { customerId } = customer;

  return (
    <div className="grid grid-cols-2 gap-2">
      {/*
        An inbound message from an unknown number has no Shopify identity, so
        there is no customer to prefill. That is the common case for a first
        contact, not an edge case.
      */}
      {customerId ? (
        <Button variant="outline" size="sm" asChild className="justify-start">
          <Link to={`/orders/new?customerId=${customerId}`}>
            <ShoppingCart className="size-3.5" />
            Create Order
          </Link>
        </Button>
      ) : (
        <NotYet title="Link this chat to a customer first">
          <Button variant="outline" size="sm" disabled className="w-full justify-start">
            <ShoppingCart className="size-3.5" />
            Create Order
          </Button>
        </NotYet>
      )}

      <NotYet title="Catalog sharing needs a WhatsApp catalog — not connected yet">
        <Button variant="outline" size="sm" disabled className="w-full justify-start">
          <ShoppingBag className="size-3.5" />
          Send Catalog
        </Button>
      </NotYet>

      <NotYet title="Payment links need a Razorpay endpoint — not built yet">
        <Button variant="outline" size="sm" disabled className="w-full justify-start">
          <LinkIcon className="size-3.5" />
          Payment Link
        </Button>
      </NotYet>

      {/*
        Invoices are generated FROM an order (GenerateInvoiceDialog lives on the
        order detail page); there is no standalone invoice-create route to link
        to, so this goes to the order instead of inventing a URL.
      */}
      {lastOrder ? (
        <Button variant="outline" size="sm" asChild className="justify-start">
          <Link to={`/orders/${lastOrder.id}`}>
            <FileText className="size-3.5" />
            New Invoice
          </Link>
        </Button>
      ) : (
        <NotYet title="No order to invoice yet">
          <Button variant="outline" size="sm" disabled className="w-full justify-start">
            <FileText className="size-3.5" />
            New Invoice
          </Button>
        </NotYet>
      )}
    </div>
  );
}
