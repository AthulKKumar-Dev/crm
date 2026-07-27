ALTER TABLE "channels" ADD COLUMN "pixel_ingest_token" TEXT;

CREATE UNIQUE INDEX "channels_pixel_ingest_token_key" ON "channels"("pixel_ingest_token");
