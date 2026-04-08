-- CreateTable
CREATE TABLE "state_tax_rates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "state_code" TEXT NOT NULL,
    "state_name" TEXT NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "state_tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT,
    "collection_type" TEXT NOT NULL,
    "sort_order" TEXT,
    "published_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_collections" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_tax_overrides" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_tax_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "state_tax_rates_organization_id_idx" ON "state_tax_rates"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "state_tax_rates_organization_id_state_code_key" ON "state_tax_rates"("organization_id", "state_code");

-- CreateIndex
CREATE INDEX "collections_organization_id_idx" ON "collections"("organization_id");

-- CreateIndex
CREATE INDEX "collections_channel_id_idx" ON "collections"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "collections_channel_id_external_id_key" ON "collections"("channel_id", "external_id");

-- CreateIndex
CREATE INDEX "product_collections_product_id_idx" ON "product_collections"("product_id");

-- CreateIndex
CREATE INDEX "product_collections_collection_id_idx" ON "product_collections"("collection_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_collections_product_id_collection_id_key" ON "product_collections"("product_id", "collection_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_tax_overrides_collection_id_key" ON "collection_tax_overrides"("collection_id");

-- CreateIndex
CREATE INDEX "collection_tax_overrides_organization_id_idx" ON "collection_tax_overrides"("organization_id");

-- AddForeignKey
ALTER TABLE "state_tax_rates" ADD CONSTRAINT "state_tax_rates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_tax_overrides" ADD CONSTRAINT "collection_tax_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_tax_overrides" ADD CONSTRAINT "collection_tax_overrides_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
