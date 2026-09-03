-- Per-variant GST override: a variant may carry its own HSN / rate / UQC /
-- supply type; NULL inherits the product's value.
--
-- Hand-written (not `prisma migrate dev`) because this repo carries known
-- schema/migration drift — see docs/migration-recovery.md.
--
-- WHY. Classification lives on the product (gst_phase2), which is right for a
-- catalogue where every variant of a listing is the same kind of goods. It is
-- wrong for a listing whose variants fall under different slabs — one product
-- with a 5% item and an 18% item as variants had no way to say so, and the
-- invoice taxed both at the product's rate. These columns let ONE variant
-- diverge without moving classification off the product for everyone else.
--
-- Nullable, no default, on purpose: a NULL here means "same as the product",
-- and the resolver reads variant → product → org default. Unlike
-- products.supply_type there is no NOT NULL DEFAULT 'TAXABLE', because that
-- would silently override a product classified EXEMPT.
--
-- Every ADD is IF NOT EXISTS so a failed run leaves nothing to undo.
--
-- Pre-flight (run against every target before deploy; expect 0 rows):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'product_variants'
--      AND column_name IN ('hsn_code','gst_rate','unit_of_measure','supply_type');

ALTER TABLE "product_variants"
  ADD COLUMN IF NOT EXISTS "hsn_code" TEXT,
  ADD COLUMN IF NOT EXISTS "gst_rate" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "unit_of_measure" TEXT,
  ADD COLUMN IF NOT EXISTS "supply_type" "GstSupplyType";
