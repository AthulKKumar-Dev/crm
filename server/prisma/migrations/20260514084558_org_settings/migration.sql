-- CreateEnum
CREATE TYPE "DraftOrderStatus" AS ENUM ('OPEN', 'INVOICE_SENT', 'COMPLETED');

-- CreateTable
CREATE TABLE "draft_orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "external_id" TEXT,
    "name" TEXT,
    "status" "DraftOrderStatus" NOT NULL DEFAULT 'OPEN',
    "customer_email" TEXT,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_discounts" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_shipping_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shipping_address" JSONB,
    "billing_address" JSONB,
    "invoice_url" TEXT,
    "invoice_sent_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_order_id" TEXT,
    "metadata" JSONB,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "external_created_at" TIMESTAMP(3),
    "external_updated_at" TIMESTAMP(3),

    CONSTRAINT "draft_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_order_line_items" (
    "id" TEXT NOT NULL,
    "draft_order_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "external_id" TEXT,
    "title" TEXT NOT NULL,
    "variant_title" TEXT,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "total_discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "requires_shipping" BOOLEAN NOT NULL DEFAULT true,
    "properties" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_order_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "draft_orders_completed_order_id_key" ON "draft_orders"("completed_order_id");

-- CreateIndex
CREATE INDEX "draft_orders_organization_id_idx" ON "draft_orders"("organization_id");

-- CreateIndex
CREATE INDEX "draft_orders_channel_id_idx" ON "draft_orders"("channel_id");

-- CreateIndex
CREATE INDEX "draft_orders_customer_id_idx" ON "draft_orders"("customer_id");

-- CreateIndex
CREATE INDEX "draft_orders_status_idx" ON "draft_orders"("status");

-- CreateIndex
CREATE INDEX "draft_orders_created_at_idx" ON "draft_orders"("created_at");

-- CreateIndex
CREATE INDEX "draft_orders_organization_id_status_idx" ON "draft_orders"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "draft_orders_channel_id_external_id_key" ON "draft_orders"("channel_id", "external_id");

-- CreateIndex
CREATE INDEX "draft_order_line_items_draft_order_id_idx" ON "draft_order_line_items"("draft_order_id");

-- CreateIndex
CREATE INDEX "draft_order_line_items_variant_id_idx" ON "draft_order_line_items"("variant_id");

-- AddForeignKey
ALTER TABLE "draft_orders" ADD CONSTRAINT "draft_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_orders" ADD CONSTRAINT "draft_orders_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_orders" ADD CONSTRAINT "draft_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_orders" ADD CONSTRAINT "draft_orders_completed_order_id_fkey" FOREIGN KEY ("completed_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_order_line_items" ADD CONSTRAINT "draft_order_line_items_draft_order_id_fkey" FOREIGN KEY ("draft_order_id") REFERENCES "draft_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_order_line_items" ADD CONSTRAINT "draft_order_line_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
