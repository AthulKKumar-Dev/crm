-- CreateEnum
CREATE TYPE "AnalyticsGranularity" AS ENUM ('DAILY', 'HOURLY');

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "granularity" "AnalyticsGranularity" NOT NULL DEFAULT 'DAILY',
    "source" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_analytics_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "visitor_id" TEXT,
    "session_id" TEXT,
    "external_customer_id" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_snapshots_organization_id_date_idx" ON "analytics_snapshots"("organization_id", "date");

-- CreateIndex
CREATE INDEX "analytics_snapshots_channel_id_date_idx" ON "analytics_snapshots"("channel_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_snapshots_channel_id_date_granularity_key" ON "analytics_snapshots"("channel_id", "date", "granularity");

-- CreateIndex
CREATE INDEX "raw_analytics_events_organization_id_occurred_at_idx" ON "raw_analytics_events"("organization_id", "occurred_at");

-- CreateIndex
CREATE INDEX "raw_analytics_events_channel_id_occurred_at_idx" ON "raw_analytics_events"("channel_id", "occurred_at");

-- CreateIndex
CREATE INDEX "raw_analytics_events_event_name_occurred_at_idx" ON "raw_analytics_events"("event_name", "occurred_at");

-- CreateIndex
CREATE INDEX "raw_analytics_events_session_id_idx" ON "raw_analytics_events"("session_id");

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_analytics_events" ADD CONSTRAINT "raw_analytics_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_analytics_events" ADD CONSTRAINT "raw_analytics_events_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
