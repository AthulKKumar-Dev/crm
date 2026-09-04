-- Warehouses as additional places of business (APOB) + "Dispatch From" on invoices.
--
-- Hand-written (not `prisma migrate dev`) — see docs/migration-recovery.md.
--
-- THE PROBLEM. GST registers per STATE: one GSTIN covers a principal place of
-- business plus any number of additional places (shops, godowns, warehouses).
-- The CRM had the registration (`organization_gstins`) and the inventory bucket
-- (`warehouses`) as two models that never met: a warehouse carried no address
-- (the column existed, nothing wrote it) and no link to a GSTIN, and nothing
-- order-side recorded which warehouse actually shipped. So every invoice could
-- only ever print the registered address — wrong on paper when the goods left
-- from a branch, and a hard requirement in the e-invoice schema (DispDtls) and
-- on e-way bills. Nothing here touches the return: GSTR-1/3B are filed per
-- GSTIN, and a warehouse never appears in them.
--
-- Everything is additive and nullable; no existing row changes meaning.

-- ── Warehouse → GSTIN (additional place of business) ──
-- `gstin_id` links a warehouse to the registration it operates under. The
-- warehouse's address state must match the registration's state; enforced in
-- WarehouseService (a place of business in another state needs its own GSTIN).
-- `apob_declared` is the merchant's own confirmation that the APOB has been
-- added on the GST portal — a registration amendment the app cannot perform.
ALTER TABLE "warehouses"
  ADD COLUMN IF NOT EXISTS "gstin_id"      TEXT,
  ADD COLUMN IF NOT EXISTS "apob_declared" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE "warehouses"
    ADD CONSTRAINT "warehouses_gstin_id_fkey"
    FOREIGN KEY ("gstin_id") REFERENCES "organization_gstins"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "warehouses_gstin_id_idx" ON "warehouses"("gstin_id");

-- ── Order dispatch point ──
-- Where the goods left from. Stamped first-write-only (offline DTO, Shopify
-- fulfilment location, or the fulfillment-order assignment read before
-- auto-invoicing) and never null-overwritten by a later sync.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "dispatch_warehouse_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "orders"
    ADD CONSTRAINT "orders_dispatch_warehouse_id_fkey"
    FOREIGN KEY ("dispatch_warehouse_id") REFERENCES "warehouses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "orders_dispatch_warehouse_id_idx"
  ON "orders"("dispatch_warehouse_id");

-- ── Invoice dispatch snapshot ──
-- Snapshotted like the seller block so the document never changes under the
-- merchant. ON DELETE SET NULL everywhere, unlike `invoices_seller_gstin_id`
-- (RESTRICT): the registration IS the legal issuer, whereas the dispatch
-- warehouse is a pointer — the invoice keeps its own name/address/state copy.
-- Warehouses are never hard-deleted anyway (ledger FKs RESTRICT), so the
-- SET NULL is theoretical and mirrors `orders.customer_id`.
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "dispatch_warehouse_id" TEXT,
  ADD COLUMN IF NOT EXISTS "dispatch_name"         TEXT,
  ADD COLUMN IF NOT EXISTS "dispatch_address"      JSONB,
  ADD COLUMN IF NOT EXISTS "dispatch_state_code"   TEXT;

DO $$ BEGIN
  ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_dispatch_warehouse_id_fkey"
    FOREIGN KEY ("dispatch_warehouse_id") REFERENCES "warehouses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "invoices_dispatch_warehouse_id_idx"
  ON "invoices"("dispatch_warehouse_id");
