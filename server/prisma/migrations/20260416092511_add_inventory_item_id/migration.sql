-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "inventory_item_id" TEXT;

-- CreateIndex
CREATE INDEX "product_variants_inventory_item_id_idx" ON "product_variants"("inventory_item_id");
