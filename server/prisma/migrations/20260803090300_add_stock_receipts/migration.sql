-- Inventory V1, migration 4/8: stock_receipts (GRN) + lines.
--
-- vendor_name reuses the existing vendor-string convention (no Supplier model
-- in V1); ref_number is a free-text vendor invoice / PO reference.
-- Receipt lines keep variant_id as a plain string so receipt history survives
-- variant deletion (same rationale as the inventory_events ledger).
--
-- Additive only; safe on a live database.

-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_receipts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "vendor_name" TEXT,
    "ref_number" TEXT,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "received_by_id" TEXT,
    "received_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_receipt_lines" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "qty_received" INTEGER NOT NULL,
    "qty_accepted" INTEGER NOT NULL DEFAULT 0,
    "qty_rejected" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(12,2),
    "putaway_location_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_receipt_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_receipt_lines_qty_received_pos" CHECK ("qty_received" > 0),
    CONSTRAINT "stock_receipt_lines_qty_accepted_nonneg" CHECK ("qty_accepted" >= 0),
    CONSTRAINT "stock_receipt_lines_qty_rejected_nonneg" CHECK ("qty_rejected" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "stock_receipts_organization_id_receipt_number_key" ON "stock_receipts"("organization_id", "receipt_number");
CREATE INDEX IF NOT EXISTS "stock_receipts_organization_id_idx" ON "stock_receipts"("organization_id");
CREATE INDEX IF NOT EXISTS "stock_receipts_warehouse_id_idx" ON "stock_receipts"("warehouse_id");
CREATE INDEX IF NOT EXISTS "stock_receipts_status_idx" ON "stock_receipts"("status");
CREATE INDEX IF NOT EXISTS "stock_receipt_lines_receipt_id_idx" ON "stock_receipt_lines"("receipt_id");
CREATE INDEX IF NOT EXISTS "stock_receipt_lines_variant_id_idx" ON "stock_receipt_lines"("variant_id");

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_receipt_lines" ADD CONSTRAINT "stock_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
