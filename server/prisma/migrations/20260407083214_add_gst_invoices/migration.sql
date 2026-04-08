/*
  Warnings:

  - You are about to drop the column `cess_amount` on the `order_line_items` table. All the data in the column will be lost.
  - You are about to drop the column `cgst_amount` on the `order_line_items` table. All the data in the column will be lost.
  - You are about to drop the column `gst_rate_percent` on the `order_line_items` table. All the data in the column will be lost.
  - You are about to drop the column `hsn_code` on the `order_line_items` table. All the data in the column will be lost.
  - You are about to drop the column `igst_amount` on the `order_line_items` table. All the data in the column will be lost.
  - You are about to drop the column `sgst_amount` on the `order_line_items` table. All the data in the column will be lost.
  - You are about to drop the column `cess_amount` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `cgst_amount` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `gst_invoice_date` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `gst_invoice_number` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `gst_profile_id` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `igst_amount` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `is_inter_state` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `place_of_supply` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `reverse_charge` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `sgst_amount` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `cess_rate_override` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `gst_rate_override` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `hsn_code_override` on the `products` table. All the data in the column will be lost.
  - You are about to drop the `collection_products` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `collections` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `gst_invoice_sequences` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `gst_profiles` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `gst_returns` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "GstType" AS ENUM ('CGST_SGST', 'IGST');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED', 'CREDIT_NOTE');

-- DropForeignKey
ALTER TABLE "collection_products" DROP CONSTRAINT "collection_products_collection_id_fkey";

-- DropForeignKey
ALTER TABLE "collection_products" DROP CONSTRAINT "collection_products_product_id_fkey";

-- DropForeignKey
ALTER TABLE "collections" DROP CONSTRAINT "collections_channel_id_fkey";

-- DropForeignKey
ALTER TABLE "collections" DROP CONSTRAINT "collections_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "gst_invoice_sequences" DROP CONSTRAINT "gst_invoice_sequences_gst_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "gst_profiles" DROP CONSTRAINT "gst_profiles_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "gst_returns" DROP CONSTRAINT "gst_returns_gst_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "gst_returns" DROP CONSTRAINT "gst_returns_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_gst_profile_id_fkey";

-- DropIndex
DROP INDEX "orders_gst_profile_id_idx";

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "billing_state_code" TEXT,
ADD COLUMN     "billing_state_name" TEXT,
ADD COLUMN     "gstin" TEXT;

-- AlterTable
ALTER TABLE "order_line_items" DROP COLUMN "cess_amount",
DROP COLUMN "cgst_amount",
DROP COLUMN "gst_rate_percent",
DROP COLUMN "hsn_code",
DROP COLUMN "igst_amount",
DROP COLUMN "sgst_amount";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "cess_amount",
DROP COLUMN "cgst_amount",
DROP COLUMN "gst_invoice_date",
DROP COLUMN "gst_invoice_number",
DROP COLUMN "gst_profile_id",
DROP COLUMN "igst_amount",
DROP COLUMN "is_inter_state",
DROP COLUMN "place_of_supply",
DROP COLUMN "reverse_charge",
DROP COLUMN "sgst_amount";

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "gst_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "cess_rate_override",
DROP COLUMN "gst_rate_override",
DROP COLUMN "hsn_code_override",
ADD COLUMN     "gst_rate" DECIMAL(5,2),
ADD COLUMN     "hsn_code" TEXT;

-- DropTable
DROP TABLE "collection_products";

-- DropTable
DROP TABLE "collections";

-- DropTable
DROP TABLE "gst_invoice_sequences";

-- DropTable
DROP TABLE "gst_profiles";

-- DropTable
DROP TABLE "gst_returns";

-- DropEnum
DROP TYPE "GstRegistrationType";

-- DropEnum
DROP TYPE "GstReturnStatus";

-- DropEnum
DROP TYPE "GstReturnType";

-- CreateTable
CREATE TABLE "organization_gstins" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "gstin" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "state_code" TEXT NOT NULL,
    "state_name" TEXT NOT NULL,
    "address" JSONB,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_gstins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "seller_gstin_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "financial_year" TEXT NOT NULL,
    "seller_gstin" TEXT NOT NULL,
    "seller_legal_name" TEXT NOT NULL,
    "seller_address" JSONB,
    "seller_state_code" TEXT NOT NULL,
    "seller_state_name" TEXT NOT NULL,
    "buyer_name" TEXT NOT NULL,
    "buyer_gstin" TEXT,
    "buyer_address" JSONB,
    "buyer_state_code" TEXT NOT NULL,
    "buyer_state_name" TEXT NOT NULL,
    "place_of_supply" TEXT NOT NULL,
    "place_of_supply_name" TEXT NOT NULL,
    "gst_type" "GstType" NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total_cgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_sgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_igst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "reverse_charge" BOOLEAN NOT NULL DEFAULT false,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "notes" TEXT,
    "metadata" JSONB,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "order_line_item_id" TEXT,
    "description" TEXT NOT NULL,
    "hsn_code" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxable_value" DECIMAL(12,2) NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL,
    "cgst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sgst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "igst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_gstins_organization_id_idx" ON "organization_gstins"("organization_id");

-- CreateIndex
CREATE INDEX "organization_gstins_state_code_idx" ON "organization_gstins"("state_code");

-- CreateIndex
CREATE UNIQUE INDEX "organization_gstins_organization_id_gstin_key" ON "organization_gstins"("organization_id", "gstin");

-- CreateIndex
CREATE INDEX "invoices_organization_id_idx" ON "invoices"("organization_id");

-- CreateIndex
CREATE INDEX "invoices_order_id_idx" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_seller_gstin_id_idx" ON "invoices"("seller_gstin_id");

-- CreateIndex
CREATE INDEX "invoices_financial_year_idx" ON "invoices"("financial_year");

-- CreateIndex
CREATE INDEX "invoices_invoice_date_idx" ON "invoices"("invoice_date");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organization_id_invoice_number_key" ON "invoices"("organization_id", "invoice_number");

-- CreateIndex
CREATE INDEX "invoice_line_items_invoice_id_idx" ON "invoice_line_items"("invoice_id");

-- AddForeignKey
ALTER TABLE "organization_gstins" ADD CONSTRAINT "organization_gstins_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_seller_gstin_id_fkey" FOREIGN KEY ("seller_gstin_id") REFERENCES "organization_gstins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
