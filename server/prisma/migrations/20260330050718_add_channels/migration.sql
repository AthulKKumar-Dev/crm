-- CreateEnum
CREATE TYPE "ChannelPlatform" AS ENUM ('SHOPIFY', 'WOOCOMMERCE', 'INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'TIKTOK', 'MANUAL');

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR', 'SYNCING');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('IDLE', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" "ChannelPlatform" NOT NULL,
    "status" "ChannelStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "credentials" JSONB,
    "external_store_id" TEXT,
    "external_store_url" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'IDLE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "records_processed" INTEGER NOT NULL DEFAULT 0,
    "records_failed" INTEGER NOT NULL DEFAULT 0,
    "total_estimated" INTEGER,
    "cursor" TEXT,
    "error_message" TEXT,
    "error_details" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channels_organization_id_idx" ON "channels"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "channels_organization_id_platform_key" ON "channels"("organization_id", "platform");

-- CreateIndex
CREATE INDEX "sync_logs_organization_id_idx" ON "sync_logs"("organization_id");

-- CreateIndex
CREATE INDEX "sync_logs_channel_id_idx" ON "sync_logs"("channel_id");

-- CreateIndex
CREATE INDEX "sync_logs_created_at_idx" ON "sync_logs"("created_at");

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
