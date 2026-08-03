-- Inventory V1, migration 3/8: stock_reservations — itemization behind the
-- StockLevel.reserved bucket.
--
-- order_id / order_line_item_id are plain strings (no FK): the order sync's
-- line-item reconcile prunes rows (shopify-sync writeOrderChildren deleteMany),
-- and a FK would either block that prune or cascade away reservation history.
-- The orders/updated diff-release handler owns consistency instead.
--
-- Additive only; safe on a live database.

-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_reservations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_line_item_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_reservations_quantity_nonneg" CHECK ("quantity" >= 0)
);

-- Partial unique (Prisma cannot model): one ACTIVE reservation per order line
-- per warehouse — release/consume flip status, they never duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS "stock_reservations_line_warehouse_active_key"
  ON "stock_reservations"("order_line_item_id", "warehouse_id")
  WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_reservations_order_id_idx" ON "stock_reservations"("order_id");
CREATE INDEX IF NOT EXISTS "stock_reservations_variant_id_status_idx" ON "stock_reservations"("variant_id", "status");
CREATE INDEX IF NOT EXISTS "stock_reservations_organization_id_idx" ON "stock_reservations"("organization_id");

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
