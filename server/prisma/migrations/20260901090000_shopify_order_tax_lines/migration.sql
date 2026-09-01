-- Persist the tax the SALES CHANNEL says it charged, so declared tax can be
-- reconciled against collected tax.
--
-- Hand-written (not `prisma migrate dev`) because this repo carries known
-- schema/migration drift — see docs/migration-recovery.md.
--
-- EVERY COLUMN IS NULLABLE WITH NO DEFAULT, DELIBERATELY.
-- `NOT NULL DEFAULT 0` would stamp every pre-existing order, and every offline
-- order that has no sales channel at all, as "the channel charged zero tax" —
-- manufacturing a tax mismatch on all of them the moment the comparison ships.
--   NULL      = we were never told.
--   0.00      = the channel told us zero.
-- Those are different facts and the reconciliation depends on the difference.
-- For the same reason there is NO BACKFILL.

ALTER TABLE "order_line_items"
  ADD COLUMN IF NOT EXISTS "channel_tax_amount" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "channel_tax_lines"  JSONB;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "channel_shipping_tax_amount" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "channel_shipping_tax_lines"  JSONB,
  ADD COLUMN IF NOT EXISTS "taxes_included"              BOOLEAN;
