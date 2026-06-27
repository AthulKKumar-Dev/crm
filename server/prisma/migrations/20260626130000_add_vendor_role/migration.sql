-- AlterEnum
-- Adds the VENDOR role. Safe in a transaction on PostgreSQL 12+ (the value is not
-- referenced by any statement in this migration). Supabase runs PG 15.
ALTER TYPE "UserRole" ADD VALUE 'VENDOR';

-- AlterTable
ALTER TABLE "organization_members" ADD COLUMN     "vendor_scope" TEXT;

-- AlterTable
ALTER TABLE "team_invites" ADD COLUMN     "vendor_scope" TEXT;

-- AlterTable
ALTER TABLE "order_line_items" ADD COLUMN     "vendor" TEXT;

-- CreateIndex
CREATE INDEX "order_line_items_vendor_idx" ON "order_line_items"("vendor");

-- Backfill: snapshot each existing line item's vendor from its variant's product.
-- Idempotent (only fills NULLs); rows whose variant was deleted (variant_id IS NULL)
-- stay NULL and are intentionally invisible to vendor-scoped views.
UPDATE "order_line_items" li
SET "vendor" = p."vendor"
FROM "product_variants" v
JOIN "products" p ON p."id" = v."product_id"
WHERE li."variant_id" = v."id" AND li."vendor" IS NULL;
