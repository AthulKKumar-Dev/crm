-- Widen payment-gateway fees into inward supplies under reverse charge.
--
-- Hand-written (not `prisma migrate dev`) — see docs/migration-recovery.md.
--
-- WHY. The fee table recorded what a gateway charged and flagged the portion
-- under reverse charge, then had nowhere to put it: GSTR-3B carried no 3.1(d)
-- row at all, so a merchant's reverse-charge liability was invisible and went
-- undeclared. Reverse charge is cash-neutral but DOUBLY declarable — the
-- liability in 3.1(d), the matching credit in 4(A)(3) — and omitting both is a
-- non-declaration the department can see.
--
-- A Shopify fee is rarely a business's only import of services (Google Ads,
-- Meta, AWS, Figma are all reverse charge too), so a 3.1(d) built from payment
-- gateways alone would be confidently too low. Widening the record to any
-- imported service is what lets the figure be complete — and only a complete
-- figure belongs in a return.
--
-- Pure rename: every value is preserved. A 'Razorpay' fee simply becomes a
-- 'Razorpay' supplier.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_name = 'payment_gateway_fees')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables
                       WHERE table_name = 'inward_supplies')
    THEN
        ALTER TABLE "payment_gateway_fees" RENAME TO "inward_supplies";
    END IF;
END $$;

-- `gateway` was payment-specific; the column now holds any supplier name.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'inward_supplies' AND column_name = 'gateway')
    THEN
        ALTER TABLE "inward_supplies" RENAME COLUMN "gateway" TO "supplier";
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class
               WHERE relname = 'payment_gateway_fees_org_period_gateway_key')
    THEN
        ALTER INDEX "payment_gateway_fees_org_period_gateway_key"
            RENAME TO "inward_supplies_org_period_supplier_key";
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class
               WHERE relname = 'payment_gateway_fees_org_period_idx')
    THEN
        ALTER INDEX "payment_gateway_fees_org_period_idx"
            RENAME TO "inward_supplies_org_period_idx";
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint
               WHERE conname = 'payment_gateway_fees_pkey')
    THEN
        ALTER TABLE "inward_supplies"
            RENAME CONSTRAINT "payment_gateway_fees_pkey" TO "inward_supplies_pkey";
    END IF;

    IF EXISTS (SELECT 1 FROM pg_constraint
               WHERE conname = 'payment_gateway_fees_organization_id_fkey')
    THEN
        ALTER TABLE "inward_supplies"
            RENAME CONSTRAINT "payment_gateway_fees_organization_id_fkey"
            TO "inward_supplies_organization_id_fkey";
    END IF;
END $$;
