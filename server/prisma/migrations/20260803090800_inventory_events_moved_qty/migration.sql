-- Inventory V1, migration 9: moved_qty on inventory_events.
--
-- For bucket-to-bucket movements (e.g. QC → DAMAGED) the legacy columns cannot
-- carry the moved amount: change_amount is the signed delta to the variant's
-- sellable quantity, which is 0 for a pure transfer. moved_qty records the
-- positive number of units the movement touched; direction lives in
-- from_bucket/to_bucket. NULL on legacy (pre-warehousing) rows.
--
-- Additive only; safe on a live database.

-- AlterTable
ALTER TABLE "inventory_events" ADD COLUMN IF NOT EXISTS "moved_qty" INTEGER;
