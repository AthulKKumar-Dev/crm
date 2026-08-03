-- Inventory V1, migration 1/8: warehouses + location tree.
--
-- One self-referencing location table models Zone → Rack → Shelf → Bin at any
-- depth; the scannable identity is the materialized full_code
-- ("WH1-A01-S02-B03"). Warehouses are deactivated (is_active = false), never
-- hard-deleted — the movement ledger references them with ON DELETE RESTRICT.
--
-- Additive only; no existing table is touched. Safe on a live database.

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('ZONE', 'RACK', 'SHELF', 'BIN');

-- CreateTable
CREATE TABLE IF NOT EXISTS "warehouses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "shopify_location_id" TEXT,
    "address" JSONB,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "warehouse_locations" (
    "id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "type" "LocationType" NOT NULL,
    "code" TEXT NOT NULL,
    "full_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_organization_id_code_key" ON "warehouses"("organization_id", "code");
CREATE INDEX IF NOT EXISTS "warehouses_organization_id_idx" ON "warehouses"("organization_id");

-- Partial unique (Prisma cannot model this): at most one default warehouse per
-- organization. Documented as a comment on the Warehouse model.
CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_organization_id_default_key"
  ON "warehouses"("organization_id")
  WHERE "is_default" = true;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_locations_warehouse_id_full_code_key" ON "warehouse_locations"("warehouse_id", "full_code");
CREATE INDEX IF NOT EXISTS "warehouse_locations_warehouse_id_type_idx" ON "warehouse_locations"("warehouse_id", "type");
CREATE INDEX IF NOT EXISTS "warehouse_locations_parent_id_idx" ON "warehouse_locations"("parent_id");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "warehouse_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
