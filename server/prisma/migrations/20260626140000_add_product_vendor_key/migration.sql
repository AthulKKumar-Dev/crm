-- AlterTable
ALTER TABLE "products" ADD COLUMN "vendor_key" TEXT;

-- CreateIndex
CREATE INDEX "products_vendor_key_idx" ON "products"("vendor_key");

-- After this migration: configure the vendor metafield in settings, RE-SYNC products
-- (so Product.vendor_key is populated from the metafield), then re-snapshot existing
-- order lines to the resolved key:
--
--   UPDATE "order_line_items" li
--   SET "vendor" = COALESCE(p."vendor_key", p."vendor")
--   FROM "product_variants" v
--   JOIN "products" p ON p."id" = v."product_id"
--   WHERE li."variant_id" = v."id";
