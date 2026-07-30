-- At most ONE live (non-cancelled) GST invoice per order.
--
-- Nothing enforced this: `createForOrderTx` performed no existence check and
-- the schema has only a plain @@index([orderId]). Duplicate statutory invoices
-- for the same sale would both flow into GSTR returns (revenue double-filed).
-- The client-side guard was a page-1 invoice-list scan matched on order display
-- name — guaranteed to re-offer the "Generate Invoice" button once an org
-- passes ~20 invoices.
--
-- PARTIAL on status <> 'CANCELLED' so the statutory cancel-then-reissue flow
-- keeps working: cancelling an invoice frees the slot for a corrected one.
--
-- Pre-flight verified 2026-07-29 on the dev DB: zero orders with more than one
-- active invoice. Re-check with:
--
--   SELECT order_id, COUNT(*) AS dupes, array_agg(invoice_number)
--   FROM invoices
--   WHERE status <> 'CANCELLED'
--   GROUP BY order_id
--   HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_order_id_active_key"
  ON "invoices"("order_id")
  WHERE "status" <> 'CANCELLED';
