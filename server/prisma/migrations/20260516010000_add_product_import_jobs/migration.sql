-- CreateTable
CREATE TABLE "product_import_jobs" (
    "id"              TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id"         TEXT,
    "status"          TEXT NOT NULL,
    "filename"        TEXT NOT NULL,
    "total_rows"      INTEGER NOT NULL DEFAULT 0,
    "processed_rows"  INTEGER NOT NULL DEFAULT 0,
    "created_count"   INTEGER NOT NULL DEFAULT 0,
    "updated_count"   INTEGER NOT NULL DEFAULT 0,
    "error_count"     INTEGER NOT NULL DEFAULT 0,
    "errors"          JSONB,
    "preview_rows"    JSONB,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at"    TIMESTAMP(3),

    CONSTRAINT "product_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_import_jobs_organization_id_idx" ON "product_import_jobs"("organization_id");

-- CreateIndex
CREATE INDEX "product_import_jobs_created_at_idx" ON "product_import_jobs"("created_at");

-- AddForeignKey
ALTER TABLE "product_import_jobs" ADD CONSTRAINT "product_import_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
