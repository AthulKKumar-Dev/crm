-- Inventory V1, migration 2/8: stock_levels — the quantity-bucket projection.
--
-- One row per variant × warehouse (location_id IS NULL in V1 = warehouse-level
-- tracking). Bin-level rows (location_id set) are V2: the two partial uniques
-- below enforce both shapes in the same table, so bin-level arrives with no
-- schema change — the established partial-unique technique (see
-- 20260729120000_manual_order_number_unique).
--
-- SQL-only constructs Prisma cannot model (documented on the StockLevel model):
--   * on_hand: generated column = available + reserved + qc + damaged
--   * CHECKs: reserved/qc/damaged never negative. `available` is deliberately
--     unchecked — it may go negative only via the Shopify order-mirror path
--     (oversold; surfaced as an alert, never silently corrected).
--
-- Additive only; safe on a live database.

-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_levels" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "location_id" TEXT,
    "available" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "qc" INTEGER NOT NULL DEFAULT 0,
    "damaged" INTEGER NOT NULL DEFAULT 0,
    "on_hand" INTEGER GENERATED ALWAYS AS ("available" + "reserved" + "qc" + "damaged") STORED,
    "default_location_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_levels_reserved_nonneg" CHECK ("reserved" >= 0),
    CONSTRAINT "stock_levels_qc_nonneg" CHECK ("qc" >= 0),
    CONSTRAINT "stock_levels_damaged_nonneg" CHECK ("damaged" >= 0)
);

-- Partial uniques (Prisma cannot model): exactly one warehouse-level row per
-- variant × warehouse, and one bin-level row per variant × warehouse × location.
CREATE UNIQUE INDEX IF NOT EXISTS "stock_levels_variant_warehouse_key"
  ON "stock_levels"("variant_id", "warehouse_id")
  WHERE "location_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "stock_levels_variant_warehouse_location_key"
  ON "stock_levels"("variant_id", "warehouse_id", "location_id")
  WHERE "location_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_levels_organization_id_idx" ON "stock_levels"("organization_id");
CREATE INDEX IF NOT EXISTS "stock_levels_variant_id_idx" ON "stock_levels"("variant_id");
CREATE INDEX IF NOT EXISTS "stock_levels_warehouse_id_idx" ON "stock_levels"("warehouse_id");
CREATE INDEX IF NOT EXISTS "stock_levels_organization_id_available_idx" ON "stock_levels"("organization_id", "available");

-- AddForeignKey — RESTRICT on variant and warehouse: deleting a variant that
-- still has stock rows must fail loudly ("zero stock first"); the delete path
-- removes all-zero stock rows before deleting the variant.
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_default_location_id_fkey" FOREIGN KEY ("default_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
