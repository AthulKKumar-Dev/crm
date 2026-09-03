-- Payment-gateway fees, and the input tax credit claimable on them.
--
-- Hand-written (not `prisma migrate dev`) — see docs/migration-recovery.md.
--
-- THE PROBLEM. The system knows what was sold and nothing about what was paid.
-- A gateway keeps a fee plus GST on that fee, and that GST is recoverable as
-- input tax credit — but no field, no gateway name and no raw payload were ever
-- stored, so it was never claimed.
--
-- ⚠️ This does NOT reduce declared turnover. A sale stays at its full value
-- however much the gateway deducts before settling; the fee is a SEPARATE
-- inward supply whose tax is recovered through ITC. Netting fees off turnover
-- would under-declare revenue against figures the department cross-matches.
-- Nothing here touches any return total.
--
-- PERIOD-LEVEL, not per-order, deliberately: a third-party gateway's fee is
-- invisible to Shopify and exists only in that gateway's monthly statement, so
-- the record has to match how the data actually arrives. A future Shopify
-- Payments sync aggregates into the same shape under source = 'SHOPIFY_SYNC'.

CREATE TABLE IF NOT EXISTS "payment_gateway_fees" (
    "id"              TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "financial_year"  TEXT NOT NULL,
    "period"          TEXT NOT NULL,

    -- Free text rather than an enum: the set of gateways is open (Shopify
    -- Payments, Razorpay, PayU, Cashfree, Paytm, and whatever launches next),
    -- and an enum would need a migration to accept a new one.
    "gateway"         TEXT NOT NULL,

    -- The fee itself, excluding tax.
    "fee_amount"      DECIMAL(12,2) NOT NULL,

    -- ⚠️ NULLABLE WITH NO DEFAULT, deliberately — the same null-vs-zero
    -- contract as order_line_items.channel_tax_amount and
    -- order_refunds.total_tax. NULL means "we were not told what the tax was";
    -- 0.00 means "we were told it is zero". A foreign invoice carrying no GST
    -- line is not a zero-GST fee, and summing NULL as zero would understate a
    -- tax claim while looking complete.
    "gst_amount"      DECIMAL(12,2),

    -- Present  => an ordinary domestic inward supply; claim the GST as ITC.
    -- Absent   => likely an import of services (Shopify's contracting entity is
    --             foreign), where the merchant self-pays the GST under reverse
    --             charge and reclaims the same amount. Both legs must be
    --             declared, and it is the first one people miss.
    "supplier_gstin"  TEXT,
    "is_reverse_charge" BOOLEAN NOT NULL DEFAULT false,

    -- MANUAL | SHOPIFY_SYNC. Keeps a future auto-capture from silently
    -- double-counting a figure somebody already typed in.
    "source"          TEXT NOT NULL DEFAULT 'MANUAL',

    "note"            TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_gateway_fees_pkey" PRIMARY KEY ("id")
);

-- One row per gateway per period. A second entry for the same pair collides
-- rather than silently duplicating the claim — the discipline gst_filings uses.
CREATE UNIQUE INDEX IF NOT EXISTS "payment_gateway_fees_org_period_gateway_key"
    ON "payment_gateway_fees" ("organization_id", "financial_year", "period", "gateway");

-- The read path is always "this org, this period".
CREATE INDEX IF NOT EXISTS "payment_gateway_fees_org_period_idx"
    ON "payment_gateway_fees" ("organization_id", "financial_year", "period");

DO $$
BEGIN
    ALTER TABLE "payment_gateway_fees"
        ADD CONSTRAINT "payment_gateway_fees_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
