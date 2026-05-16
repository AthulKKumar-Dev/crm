-- AlterTable
ALTER TABLE "product_variants"
  ADD COLUMN "cost"                              DECIMAL(12, 2),
  ADD COLUMN "track_quantity"                    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "continue_selling_when_out_of_stock" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hs_code"                           TEXT,
  ADD COLUMN "country_of_origin"                 TEXT;
