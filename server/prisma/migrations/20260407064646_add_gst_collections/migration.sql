-- CreateEnum
CREATE TYPE "GstRegistrationType" AS ENUM ('REGULAR', 'COMPOSITION', 'UNREGISTERED');

-- CreateEnum
CREATE TYPE "GstReturnType" AS ENUM ('GSTR1', 'GSTR3B', 'GSTR9', 'CMP08');

-- CreateEnum
CREATE TYPE "GstReturnStatus" AS ENUM ('DRAFT', 'GENERATED', 'REVIEWED', 'FILED');

-- AlterTable
ALTER TABLE "order_line_items" ADD COLUMN     "cess_amount" DECIMAL(12,2),
ADD COLUMN     "cgst_amount" DECIMAL(12,2),
ADD COLUMN     "gst_rate_percent" DECIMAL(5,2),
ADD COLUMN     "hsn_code" TEXT,
ADD COLUMN     "igst_amount" DECIMAL(12,2),
ADD COLUMN     "sgst_amount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cess_amount" DECIMAL(12,2),
ADD COLUMN     "cgst_amount" DECIMAL(12,2),
ADD COLUMN     "gst_invoice_date" TIMESTAMP(3),
ADD COLUMN     "gst_invoice_number" TEXT,
ADD COLUMN     "gst_profile_id" TEXT,
ADD COLUMN     "igst_amount" DECIMAL(12,2),
ADD COLUMN     "is_inter_state" BOOLEAN,
ADD COLUMN     "place_of_supply" TEXT,
ADD COLUMN     "reverse_charge" BOOLEAN DEFAULT false,
ADD COLUMN     "sgst_amount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "cess_rate_override" DECIMAL(5,2),
ADD COLUMN     "gst_rate_override" DECIMAL(5,2),
ADD COLUMN     "hsn_code_override" TEXT;

-- CreateTable
CREATE TABLE "gst_profiles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "gstin" TEXT,
    "registration_type" "GstRegistrationType" NOT NULL DEFAULT 'REGULAR',
    "legal_name" TEXT,
    "trade_name" TEXT,
    "state_code" TEXT NOT NULL,
    "state_name" TEXT NOT NULL,
    "pan_number" TEXT,
    "address" JSONB,
    "base_gst_rate" DECIMAL(5,2) NOT NULL,
    "base_cess_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "base_hsn_code" TEXT,
    "composition_rate" DECIMAL(5,2),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "registered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gst_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gst_invoice_sequences" (
    "id" TEXT NOT NULL,
    "gst_profile_id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'INV',
    "financial_year" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gst_invoice_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gst_returns" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "gst_profile_id" TEXT NOT NULL,
    "return_type" "GstReturnType" NOT NULL,
    "period" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "status" "GstReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" JSONB,
    "b2b_data" JSONB,
    "b2c_large_data" JSONB,
    "b2c_small_data" JSONB,
    "hsn_summary" JSONB,
    "generated_at" TIMESTAMP(3),
    "filed_at" TIMESTAMP(3),
    "filing_reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gst_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT,
    "body_html" TEXT,
    "collection_type" TEXT NOT NULL,
    "image_url" TEXT,
    "sort_order" TEXT,
    "published_at" TIMESTAMP(3),
    "external_created_at" TIMESTAMP(3),
    "external_updated_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "hsn_code" TEXT,
    "sac_code" TEXT,
    "gst_rate_percent" DECIMAL(5,2),
    "cess_percent" DECIMAL(5,2) DEFAULT 0,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_products" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gst_profiles_organization_id_idx" ON "gst_profiles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "gst_profiles_organization_id_gstin_key" ON "gst_profiles"("organization_id", "gstin");

-- CreateIndex
CREATE UNIQUE INDEX "gst_profiles_organization_id_state_code_key" ON "gst_profiles"("organization_id", "state_code");

-- CreateIndex
CREATE UNIQUE INDEX "gst_invoice_sequences_gst_profile_id_financial_year_key" ON "gst_invoice_sequences"("gst_profile_id", "financial_year");

-- CreateIndex
CREATE INDEX "gst_returns_organization_id_idx" ON "gst_returns"("organization_id");

-- CreateIndex
CREATE INDEX "gst_returns_gst_profile_id_idx" ON "gst_returns"("gst_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "gst_returns_gst_profile_id_return_type_period_key" ON "gst_returns"("gst_profile_id", "return_type", "period");

-- CreateIndex
CREATE INDEX "collections_organization_id_idx" ON "collections"("organization_id");

-- CreateIndex
CREATE INDEX "collections_channel_id_idx" ON "collections"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "collections_channel_id_external_id_key" ON "collections"("channel_id", "external_id");

-- CreateIndex
CREATE INDEX "collection_products_collection_id_idx" ON "collection_products"("collection_id");

-- CreateIndex
CREATE INDEX "collection_products_product_id_idx" ON "collection_products"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_products_collection_id_product_id_key" ON "collection_products"("collection_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_products_collection_id_external_id_key" ON "collection_products"("collection_id", "external_id");

-- CreateIndex
CREATE INDEX "orders_gst_profile_id_idx" ON "orders"("gst_profile_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_gst_profile_id_fkey" FOREIGN KEY ("gst_profile_id") REFERENCES "gst_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gst_profiles" ADD CONSTRAINT "gst_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gst_invoice_sequences" ADD CONSTRAINT "gst_invoice_sequences_gst_profile_id_fkey" FOREIGN KEY ("gst_profile_id") REFERENCES "gst_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gst_returns" ADD CONSTRAINT "gst_returns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gst_returns" ADD CONSTRAINT "gst_returns_gst_profile_id_fkey" FOREIGN KEY ("gst_profile_id") REFERENCES "gst_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
