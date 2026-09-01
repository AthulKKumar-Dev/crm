-- Surface auto-invoicing failures instead of swallowing them.
--
-- `maybeAutoInvoice` logs and continues on failure by design (a failed invoice
-- must never fail the webhook), so an organization with GST disabled or no
-- default GSTIN silently accrued paid, uninvoiced orders with no signal
-- anywhere in the product.
--
-- Set on failure, NULLed on any successful issue — including a manual reissue —
-- so the count repairs itself once the merchant fixes the configuration.

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "invoice_error"    TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_error_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "orders_org_invoice_error_idx"
  ON "orders" ("organization_id") WHERE "invoice_error" IS NOT NULL;
