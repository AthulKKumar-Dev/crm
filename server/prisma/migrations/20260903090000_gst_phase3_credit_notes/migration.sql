-- Phase 3: credit notes, refund tax, and filing state.
--
-- Hand-written (not `prisma migrate dev`) — see docs/migration-recovery.md.
--
-- THE PROBLEM. A refunded sale stayed 100% in declared liability for ever.
-- `order_refunds` carried an amount and nothing else — no tax split at all —
-- `InvoiceStatus.CREDIT_NOTE` was dead code, and GSTR-1 had no Table 9B. Any
-- merchant who accepts returns has been over-declaring output tax every month.

-- ── Refund tax ──
-- Nullable with no default, for the same reason as the Phase 1 channel-tax
-- columns: NULL means "the payload never told us", 0.00 means "it told us zero".
-- A refund synced before this migration has no tax breakdown and must not be
-- mistaken for a tax-free refund.
ALTER TABLE "order_refunds"
  ADD COLUMN IF NOT EXISTS "total_tax"    DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "shipping_tax" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "tax_lines"    JSONB,
  -- Shopify reports discounts and shipping written off after the fact as
  -- `order_adjustments`, separate from refund_line_items. Ignoring them
  -- understates the credit note.
  ADD COLUMN IF NOT EXISTS "adjustments"  JSONB;

-- ── Credit notes ──
-- Reuses the `invoices` table with status CREDIT_NOTE (the enum value has
-- existed since the GST tables were created). A credit note is shaped like an
-- invoice and must appear beside them in the return, so a parallel table would
-- duplicate 30 columns and fork the fold in gst-return.accumulator.ts.
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "credit_note_for_id" TEXT,
  ADD COLUMN IF NOT EXISTS "credit_note_reason" TEXT;

DO $$ BEGIN
  ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_credit_note_for_id_fkey"
    FOREIGN KEY ("credit_note_for_id") REFERENCES "invoices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "invoices_credit_note_for_id_idx"
  ON "invoices" ("credit_note_for_id");

-- ⚠️ LOAD-BEARING. `invoices_order_id_active_key` enforces one live invoice per
-- order and excluded only CANCELLED — so raising a credit note against an
-- already-invoiced order would violate it and the whole feature would be
-- impossible. A credit note is not an invoice and must not occupy that slot.
DROP INDEX IF EXISTS "invoices_order_id_active_key";
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_order_id_active_key"
  ON "invoices"("order_id")
  WHERE "status" NOT IN ('CANCELLED', 'CREDIT_NOTE');

-- ── Filing state ──
-- Nothing recorded that a period had been filed, so cancelling or issuing an
-- invoice inside an already-filed month silently rewrote history.
CREATE TABLE IF NOT EXISTS "gst_filings" (
  "id"              TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "financial_year"  TEXT NOT NULL,
  "period"          TEXT NOT NULL,
  -- Null means "all registrations" — a single-GSTIN org files one return.
  "seller_gstin_id" TEXT,
  "return_type"     TEXT NOT NULL,
  "filed_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "filed_by_id"     TEXT,
  -- Acknowledgement Reference Number from the portal, when the merchant has it.
  "arn"             TEXT,
  -- Snapshot of what was filed, so a later recomputation can be compared
  -- against what actually went to the government.
  "totals"          JSONB,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gst_filings_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "gst_filings"
    ADD CONSTRAINT "gst_filings_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- One filing per (org, FY, period, registration, return type). NULLS NOT
-- DISTINCT so a second all-registrations filing for the same period collides
-- rather than silently duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS "gst_filings_period_key"
  ON "gst_filings" ("organization_id", "financial_year", "period", "return_type", "seller_gstin_id")
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS "gst_filings_organization_id_idx"
  ON "gst_filings" ("organization_id");
