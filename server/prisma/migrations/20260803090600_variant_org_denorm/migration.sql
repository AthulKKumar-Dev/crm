-- Inventory V1, migration 7/8: denormalize organization_id onto product_variants.
--
-- Why: the barcode/SKU scan lookup is the hottest read of the pick flow and
-- must not join through products; duplicate detection is org-scoped. Scalar
-- only — org scoping remains transitive via product; this is an index column.
--
-- The column stays NULLABLE for now. App code sets it on every variant create
-- from this deploy onward; the SET NOT NULL flip ships as its own migration
-- once all writers are verified in production (safer than flipping here and
-- discovering a missed writer via insert failures).
--
-- The backfill is a single UPDATE. At current data volumes this is fine; if a
-- deployment ever has millions of variant rows, run the same statement in
-- batches (WHERE id IN (SELECT ... LIMIT n)) out-of-band first — the statement
-- is idempotent (WHERE organization_id IS NULL).
--
-- Verify after applying:
--   SELECT COUNT(*) FROM product_variants WHERE organization_id IS NULL;
--   -- expected: 0

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;

-- Backfill from the owning product.
UPDATE "product_variants" pv
SET "organization_id" = p."organization_id"
FROM "products" p
WHERE pv."product_id" = p."id"
  AND pv."organization_id" IS NULL;

-- CreateIndex — the scan-lookup hot paths.
CREATE INDEX IF NOT EXISTS "product_variants_organization_id_sku_idx" ON "product_variants"("organization_id", "sku");
CREATE INDEX IF NOT EXISTS "product_variants_organization_id_barcode_idx" ON "product_variants"("organization_id", "barcode");
