-- CreateTable
CREATE TABLE "product_type_tax_rates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_type" TEXT NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_type_tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_type_tax_rates_organization_id_idx" ON "product_type_tax_rates"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_type_tax_rates_organization_id_product_type_key" ON "product_type_tax_rates"("organization_id", "product_type");

-- AddForeignKey
ALTER TABLE "product_type_tax_rates" ADD CONSTRAINT "product_type_tax_rates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
