-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN "image_id" TEXT;

-- AlterTable
ALTER TABLE "product_images" ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER;

-- CreateIndex
CREATE INDEX "product_variants_image_id_idx" ON "product_variants"("image_id");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "product_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
