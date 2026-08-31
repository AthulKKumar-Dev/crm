-- Carry the order's shipping charge onto the invoice.
--
-- GstCalculatorService.calculateInvoiceTotals has always computed
--   grandTotal = subtotal + totalTax + shipping
-- but `shipping` was only ever a function argument: it was folded into
-- grand_total and then discarded. Nothing on the invoice row, the detail
-- dialog, the printed tax invoice or the CSV export recorded it, so on every
-- Shopify order carrying shipping the printed grand total exceeded the visible
-- lines by an unexplained amount. Offline orders write totalShippingPrice = 0,
-- so only channel-synced orders are affected — which is most of them.
--
-- Shipping is deliberately NOT taxed here (not treated as a composite supply);
-- that decision is documented on calculateInvoiceTotals and is unchanged.
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "shipping_charge" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- The backfill is exact, not an estimate. Because grand_total was ALWAYS
-- written as subtotal + total_tax + shipping, the shipping actually capitalised
-- into each existing invoice is recoverable by rearranging that identity. No
-- join to `orders` is used on purpose: the order may have been edited since the
-- invoice was issued, and the invoice is a statutory snapshot — it must be
-- reconstructed from its own stored figures, not from current order state.
--
-- GREATEST(..., 0) guards the float-rounding case where the three stored
-- figures disagree by a hundredth, which would otherwise write a negative
-- charge. WHERE "shipping_charge" = 0 makes the statement idempotent if this
-- migration is ever re-run against a partially-migrated database.
UPDATE "invoices"
SET "shipping_charge" = GREATEST(("grand_total" - "subtotal" - "total_tax"), 0)
WHERE "shipping_charge" = 0;
