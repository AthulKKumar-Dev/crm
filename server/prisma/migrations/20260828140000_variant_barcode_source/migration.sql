-- Record where each variant barcode came from.
--
-- Three separate defects all trace back to the same missing fact — the system
-- cannot tell a barcode it minted from one a human typed or Shopify supplied:
--
--   1. The Shopify pull destroys generated barcodes. shopify-sync's variant
--      upsert writes `barcode: sv.barcode` unconditionally, so a Shopify
--      variant with no barcode nulls the local value. It is not gated on the
--      Sync button either — the products/update webhook runs the same upsert,
--      so any edit in Shopify Admin wipes it in real time, and labels already
--      printed stop resolving on scan.
--   2. "Regenerate barcodes" had no safe target set. Matching on
--      `barcode = sku` catches only the first-generation codes; the 6-digit
--      short codes never equalled the SKU.
--   3. Internal codes leak to Shopify. The push serialises the whole variant
--      row, so a code minted here reaches the merchant's Shopify barcode field
--      on the next unrelated push. That is now opt-in
--      (inventorySettings.pushGeneratedBarcodes), which needs to know which
--      codes are ours.
--
-- Nullable with no default: a NULL means "legacy row the backfill could not
-- classify", which application code treats as MANUAL (leave alone). That is
-- the conservative reading — we never regenerate or suppress a barcode we are
-- unsure about.
CREATE TYPE "BarcodeSource" AS ENUM ('GENERATED', 'MANUAL', 'SHOPIFY');

ALTER TABLE "product_variants"
  ADD COLUMN IF NOT EXISTS "barcode_source" "BarcodeSource";

-- Backfill, most-confident classification first. Rows with no barcode stay
-- NULL — there is nothing to attribute.

-- 1. GENERATED: the original generator's signature was `barcode = sku`
--    (sku-generator.generateBarcodes copied the SKU verbatim). Nothing else
--    produces that equality by chance in practice.
UPDATE "product_variants"
   SET "barcode_source" = 'GENERATED'
 WHERE "barcode" IS NOT NULL
   AND "sku" IS NOT NULL
   AND "barcode" = "sku";

-- 2. SHOPIFY: variant came down from Shopify (external_id is the Shopify
--    variant id, always set on synced rows) and carries a barcode we did not
--    mint. Treated as authoritative — a real GTIN, most likely.
UPDATE "product_variants"
   SET "barcode_source" = 'SHOPIFY'
 WHERE "barcode" IS NOT NULL
   AND "barcode_source" IS NULL
   AND "external_id" IS NOT NULL
   AND "external_id" <> '';

-- 3. MANUAL: everything else with a barcode — CRM-native products whose code
--    was typed or CSV-imported.
UPDATE "product_variants"
   SET "barcode_source" = 'MANUAL'
 WHERE "barcode" IS NOT NULL
   AND "barcode_source" IS NULL;

-- Deliberately NO unique constraint on barcode. Shopify legally syncs
-- duplicate barcodes in (the same GTIN across variants is valid), so a hard
-- constraint would break imports — this is the existing documented decision in
-- sku-generator.service.ts. Generated-code uniqueness is enforced in the
-- application at write time instead.
CREATE INDEX IF NOT EXISTS "product_variants_barcode_source_idx"
  ON "product_variants" ("organization_id", "barcode_source");
