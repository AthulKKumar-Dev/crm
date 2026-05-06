import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { useCreateOfflineOrderMutation } from "~/hooks/use-order-mutations";
import { CustomerPickerOrCreate } from "./customer-picker-or-create";
import { ProductPicker, type CartLineSeed } from "./product-picker";
import { OrderCart, type CartLine } from "./order-cart";
import { BillSummary } from "./bill-summary";
import type {
  CreateOfflineOrderRequest,
  OfflineCustomerInput,
  OfflinePaymentMethod,
} from "~/types/api";

type CustomerSelection = {
  customerId?: string;
  newCustomer?: OfflineCustomerInput;
};

export function OfflineOrderForm() {
  const navigate = useNavigate();
  const { data: org } = useCurrentOrg();
  const currency = org?.currency ?? "INR";
  const createOrder = useCreateOfflineOrderMutation();

  const [customer, setCustomer] = useState<CustomerSelection>({});
  const [lines, setLines] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] =
    useState<OfflinePaymentMethod>("CASH");
  const [note, setNote] = useState("");

  function addLine(seed: CartLineSeed) {
    setLines((prev) => {
      // If already in cart, bump quantity rather than duplicate.
      const existing = prev.find((l) => l.variantId === seed.variantId);
      if (existing) {
        return prev.map((l) =>
          l.variantId === seed.variantId
            ? { ...l, quantity: l.quantity + 1 }
            : l,
        );
      }
      return [
        ...prev,
        {
          variantId: seed.variantId,
          productId: seed.productId,
          productTitle: seed.productTitle,
          variantTitle: seed.variantTitle,
          quantity: 1,
          unitPrice: seed.unitPrice,
          inventoryQuantity: seed.inventoryQuantity,
          gstRate: seed.gstRate,
        },
      ];
    });
  }

  function updateLine(variantId: string, patch: Partial<CartLine>) {
    setLines((prev) =>
      prev.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(variantId: string) {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  }

  const excludedVariantIds = useMemo(
    () => new Set(lines.map((l) => l.variantId)),
    [lines],
  );

  // Match the server's `resolveCustomer` rule: any one of customerId, email,
  // phone, firstName, or lastName is enough to identify the buyer.
  const nc = customer.newCustomer;
  const customerReady =
    !!customer.customerId ||
    !!(nc?.email || nc?.phone || nc?.firstName || nc?.lastName);
  const linesReady =
    lines.length > 0 && lines.every((l) => l.quantity > 0 && l.unitPrice >= 0);
  // Stock is shown as an informational warning in the cart but does NOT block
  // submission — inventory tracking on offline orders is a follow-up task.
  const canSubmit = customerReady && linesReady;

  // Build a hint so the disabled state isn't a mystery.
  let disabledReason: string | null = null;
  if (!customerReady && lines.length === 0) {
    disabledReason = "Pick or create a customer and add at least one product.";
  } else if (!customerReady) {
    disabledReason =
      "Pick a customer, or fill in a name / email / phone for a new one.";
  } else if (!linesReady) {
    disabledReason = "Add at least one product with a quantity of 1 or more.";
  }

  function handleSubmit() {
    if (!canSubmit) return;

    const customerBlock: OfflineCustomerInput = customer.customerId
      ? { customerId: customer.customerId }
      : customer.newCustomer ?? {};

    const payload: CreateOfflineOrderRequest = {
      customer: customerBlock,
      lineItems: lines.map((l) => ({
        productVariantId: l.variantId,
        quantity: l.quantity,
        // Server treats this as a price snapshot; harmless to always send.
        unitPriceOverride: l.unitPrice,
      })),
      paymentMethod,
      note: note || undefined,
    };

    createOrder.mutate(payload, {
      onSuccess: (result) => {
        // Same-tab navigate avoids popup-blocker issues with window.open.
        // The print view auto-fires window.print() and the merchant can hit
        // Back to return to the orders list.
        if (result.invoice) {
          navigate(`/invoices/${result.invoice.id}/print`);
        } else {
          navigate("/orders");
        }
      },
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Section
          title="Customer"
          subtitle="Search an existing customer or create a new one. Existing customers (e.g. someone who bought online) keep their order history."
        >
          <CustomerPickerOrCreate
            value={customer}
            onChange={setCustomer}
            currency={currency}
          />
        </Section>

        <Section
          title="Products"
          subtitle="Search and add the items being purchased. Adjust quantity or unit price inline."
        >
          <div className="space-y-3">
            <ProductPicker
              onAdd={addLine}
              currency={currency}
              excludedVariantIds={excludedVariantIds}
            />
            <OrderCart
              lines={lines}
              onUpdate={updateLine}
              onRemove={removeLine}
              currency={currency}
            />
          </div>
        </Section>
      </div>

      <div className="lg:col-span-1">
        <div className="sticky top-6">
          <BillSummary
            lines={lines}
            currency={currency}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            note={note}
            onNoteChange={setNote}
            isSubmitting={createOrder.isPending}
            canSubmit={canSubmit}
            disabledReason={disabledReason}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h2>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}
