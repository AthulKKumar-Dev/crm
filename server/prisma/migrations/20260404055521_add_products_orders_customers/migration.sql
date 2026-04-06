-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrderFinancialStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "OrderFulfillmentStatus" AS ENUM ('UNFULFILLED', 'FULFILLED', 'PARTIAL', 'RESTOCKED');

-- CreateEnum
CREATE TYPE "OrderCancelReason" AS ENUM ('CUSTOMER', 'FRAUD', 'INVENTORY', 'DECLINED', 'OTHER');

-- CreateEnum
CREATE TYPE "CustomerState" AS ENUM ('ENABLED', 'DISABLED', 'DECLINED', 'INVITED');

-- CreateEnum
CREATE TYPE "VipLevel" AS ENUM ('NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body_html" TEXT,
    "vendor" TEXT,
    "product_type" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "options" JSONB,
    "published_at" TIMESTAMP(3),
    "metadata" JSONB,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "external_created_at" TIMESTAMP(3),
    "external_updated_at" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "compare_at_price" DECIMAL(12,2),
    "inventory_quantity" INTEGER NOT NULL DEFAULT 0,
    "weight" DECIMAL(10,4),
    "weight_unit" TEXT,
    "option1" TEXT,
    "option2" TEXT,
    "option3" TEXT,
    "position" INTEGER NOT NULL DEFAULT 1,
    "requires_shipping" BOOLEAN NOT NULL DEFAULT true,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "src" TEXT NOT NULL,
    "alt" TEXT,
    "position" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "email" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "state" "CustomerState" NOT NULL DEFAULT 'ENABLED',
    "verified_email" BOOLEAN NOT NULL DEFAULT false,
    "accepts_marketing" BOOLEAN NOT NULL DEFAULT false,
    "orders_count" INTEGER NOT NULL DEFAULT 0,
    "total_spent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "addresses" JSONB,
    "default_address" JSONB,
    "vip_level" "VipLevel" NOT NULL DEFAULT 'NONE',
    "internal_notes" TEXT,
    "segments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "external_created_at" TIMESTAMP(3),
    "external_updated_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_activity_logs" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "external_id" TEXT NOT NULL,
    "order_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "financial_status" "OrderFinancialStatus" NOT NULL,
    "fulfillment_status" "OrderFulfillmentStatus" NOT NULL DEFAULT 'UNFULFILLED',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal_price" DECIMAL(12,2) NOT NULL,
    "total_price" DECIMAL(12,2) NOT NULL,
    "total_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_discounts" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_shipping_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shipping_address" JSONB,
    "billing_address" JSONB,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cancel_reason" "OrderCancelReason",
    "cancelled_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "external_created_at" TIMESTAMP(3),
    "external_updated_at" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_line_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "external_id" TEXT NOT NULL,
    "external_product_id" TEXT,
    "external_variant_id" TEXT,
    "title" TEXT NOT NULL,
    "variant_title" TEXT,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "total_discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fulfillment_status" TEXT,
    "requires_shipping" BOOLEAN NOT NULL DEFAULT true,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "properties" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_fulfillments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "external_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tracking_number" TEXT,
    "tracking_url" TEXT,
    "tracking_company" TEXT,
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_fulfillments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_refunds" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT,
    "note" TEXT,
    "line_items" JSONB,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_timeline_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity_before" INTEGER NOT NULL,
    "quantity_after" INTEGER NOT NULL,
    "change_amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_organization_id_idx" ON "products"("organization_id");

-- CreateIndex
CREATE INDEX "products_channel_id_idx" ON "products"("channel_id");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_vendor_idx" ON "products"("vendor");

-- CreateIndex
CREATE INDEX "products_product_type_idx" ON "products"("product_type");

-- CreateIndex
CREATE INDEX "products_created_at_idx" ON "products"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "products_channel_id_external_id_key" ON "products"("channel_id", "external_id");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "product_variants_sku_idx" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_inventory_quantity_idx" ON "product_variants"("inventory_quantity");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_external_id_key" ON "product_variants"("product_id", "external_id");

-- CreateIndex
CREATE INDEX "product_images_product_id_idx" ON "product_images"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_images_product_id_external_id_key" ON "product_images"("product_id", "external_id");

-- CreateIndex
CREATE INDEX "customers_organization_id_idx" ON "customers"("organization_id");

-- CreateIndex
CREATE INDEX "customers_channel_id_idx" ON "customers"("channel_id");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_vip_level_idx" ON "customers"("vip_level");

-- CreateIndex
CREATE INDEX "customers_total_spent_idx" ON "customers"("total_spent");

-- CreateIndex
CREATE INDEX "customers_created_at_idx" ON "customers"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "customers_channel_id_external_id_key" ON "customers"("channel_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organization_id_email_key" ON "customers"("organization_id", "email");

-- CreateIndex
CREATE INDEX "customer_activity_logs_customer_id_idx" ON "customer_activity_logs"("customer_id");

-- CreateIndex
CREATE INDEX "customer_activity_logs_created_at_idx" ON "customer_activity_logs"("created_at");

-- CreateIndex
CREATE INDEX "orders_organization_id_idx" ON "orders"("organization_id");

-- CreateIndex
CREATE INDEX "orders_channel_id_idx" ON "orders"("channel_id");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_financial_status_idx" ON "orders"("financial_status");

-- CreateIndex
CREATE INDEX "orders_fulfillment_status_idx" ON "orders"("fulfillment_status");

-- CreateIndex
CREATE INDEX "orders_order_number_idx" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "orders_organization_id_financial_status_idx" ON "orders"("organization_id", "financial_status");

-- CreateIndex
CREATE INDEX "orders_organization_id_fulfillment_status_idx" ON "orders"("organization_id", "fulfillment_status");

-- CreateIndex
CREATE UNIQUE INDEX "orders_channel_id_external_id_key" ON "orders"("channel_id", "external_id");

-- CreateIndex
CREATE INDEX "order_line_items_order_id_idx" ON "order_line_items"("order_id");

-- CreateIndex
CREATE INDEX "order_line_items_variant_id_idx" ON "order_line_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_line_items_order_id_external_id_key" ON "order_line_items"("order_id", "external_id");

-- CreateIndex
CREATE INDEX "order_fulfillments_order_id_idx" ON "order_fulfillments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_fulfillments_order_id_external_id_key" ON "order_fulfillments"("order_id", "external_id");

-- CreateIndex
CREATE INDEX "order_refunds_order_id_idx" ON "order_refunds"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_refunds_order_id_external_id_key" ON "order_refunds"("order_id", "external_id");

-- CreateIndex
CREATE INDEX "order_timeline_events_order_id_idx" ON "order_timeline_events"("order_id");

-- CreateIndex
CREATE INDEX "order_timeline_events_created_at_idx" ON "order_timeline_events"("created_at");

-- CreateIndex
CREATE INDEX "inventory_events_organization_id_idx" ON "inventory_events"("organization_id");

-- CreateIndex
CREATE INDEX "inventory_events_variant_id_idx" ON "inventory_events"("variant_id");

-- CreateIndex
CREATE INDEX "inventory_events_created_at_idx" ON "inventory_events"("created_at");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_activity_logs" ADD CONSTRAINT "customer_activity_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_fulfillments" ADD CONSTRAINT "order_fulfillments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_timeline_events" ADD CONSTRAINT "order_timeline_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
