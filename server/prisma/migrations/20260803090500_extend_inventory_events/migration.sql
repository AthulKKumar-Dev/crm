-- Inventory V1, migration 6/8: extend inventory_events into the movement ledger.
--
-- One row = one atomic transition of change_amount units between buckets:
--   from_bucket NULL → stock entering the system (receipt, return, migration seed)
--   to_bucket   NULL → stock leaving the system (dispatch, write-off)
-- All columns nullable → legacy rows stay valid unchanged; legacy writers keep
-- working before the code deploy lands.
--
-- variant_id deliberately stays a plain string (no FK): the audit trail must
-- survive variant deletion; sku_snapshot preserves identity.
--
-- The idempotency partial unique makes webhook/BullMQ retries no-ops: an insert
-- with an already-seen key fails uniquely and the movement is skipped.
--
-- Additive only; safe on a live database.

-- CreateEnum
CREATE TYPE "StockBucket" AS ENUM ('AVAILABLE', 'RESERVED', 'QC', 'DAMAGED');

-- AlterTable
ALTER TABLE "inventory_events" ADD COLUMN IF NOT EXISTS "warehouse_id" TEXT;
ALTER TABLE "inventory_events" ADD COLUMN IF NOT EXISTS "location_id" TEXT;
ALTER TABLE "inventory_events" ADD COLUMN IF NOT EXISTS "from_bucket" "StockBucket";
ALTER TABLE "inventory_events" ADD COLUMN IF NOT EXISTS "to_bucket" "StockBucket";
ALTER TABLE "inventory_events" ADD COLUMN IF NOT EXISTS "sku_snapshot" TEXT;
ALTER TABLE "inventory_events" ADD COLUMN IF NOT EXISTS "actor_id" TEXT;
ALTER TABLE "inventory_events" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

-- Partial unique (Prisma cannot model): dedup key for retried webhooks/jobs,
-- e.g. 'shopify:order:123:reserve'.
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_events_org_idempotency_key"
  ON "inventory_events"("organization_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "inventory_events_organization_id_warehouse_id_created_at_idx"
  ON "inventory_events"("organization_id", "warehouse_id", "created_at");

-- AddForeignKey — RESTRICT: warehouses are deactivated, never deleted, so this
-- never fires in practice; it exists to make accidental hard-deletes fail loudly.
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
