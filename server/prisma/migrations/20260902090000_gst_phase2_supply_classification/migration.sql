-- Phase 2: classify supplies so GSTR-1 can carry the tables the statute requires.
--
-- Hand-written (not `prisma migrate dev`) because this repo carries known
-- schema/migration drift — see docs/migration-recovery.md.
--
-- WHY A CLASSIFICATION COLUMN AT ALL. Nil-rated, exempt and non-GST are three
-- legally distinct statuses that all resolve to zero tax, so they cannot be
-- inferred from a 0% rate — they are a property of the goods. Today all four
-- of these collapse into the single number 0 before reaching the invoice:
--   1. a line flagged non-taxable
--   2. a product explicitly configured at 0% (nil-rated)
--   3. no rate configured anywhere (a data gap, not a legal status)
--   4. a genuine exempt / non-GST supply (inexpressible)
-- GSTR-1 Table 8 and GSTR-3B 3.1(c)/(e) cannot be produced from that.
--
-- ZERO_RATED is the one value that IS derived, from an export place of supply.

DO $$ BEGIN
  CREATE TYPE "GstSupplyType" AS ENUM (
    'TAXABLE', 'EXEMPT', 'NIL_RATED', 'NON_GST', 'ZERO_RATED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- A fourth per-domain settings group, beside product/order/inventory.
-- Nullable: settings rows are upserted on first write, never seeded, and reads
-- parse-through-defaults.
ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "tax_settings" JSONB;

-- Classification and unit of quantity live on the product, which is where a
-- merchant classifies their catalogue.
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "unit_of_measure" TEXT,
  ADD COLUMN IF NOT EXISTS "supply_type" "GstSupplyType" NOT NULL DEFAULT 'TAXABLE';

-- Snapshotted onto the invoice line at issue time, like hsn_code and every
-- other statutory value here: the invoice must not change when the product
-- is later reclassified.
ALTER TABLE "invoice_line_items"
  ADD COLUMN IF NOT EXISTS "unit_of_measure" TEXT,
  ADD COLUMN IF NOT EXISTS "supply_type" "GstSupplyType" NOT NULL DEFAULT 'TAXABLE';

-- This is what lets the invented '0000' stop.
--
-- '0000' is not a valid HSN and it was being written onto statutory documents
-- whenever a product had none — which is every product in every real org.
-- Going forward the column holds NULL for "not classified".
--
-- DELIBERATELY NOT BACKFILLED: the 8 existing '0000' rows sit on ISSUED
-- invoices, which are statutory snapshots. Phase 1 refused to rewrite issued
-- invoices for charged_tax and the same rule applies here. Readers must treat
-- BOTH NULL and '0000' as "missing".
ALTER TABLE "invoice_line_items"
  ALTER COLUMN "hsn_code" DROP NOT NULL;

-- Mirrors the tax_mismatch pattern: derivable by joining line items, but stored
-- and partially indexed so the filing tab's warning count is one index scan.
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "hsn_missing" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "invoices_org_hsn_missing_idx"
  ON "invoices" ("organization_id") WHERE "hsn_missing";
