-- Remap BillingPlan enum values: FREE/STARTER -> BASIC, GROWTH/ENTERPRISE -> ADVANCE.
-- The old default was FREE; the new default is BASIC.
ALTER TYPE "BillingPlan" RENAME TO "BillingPlan_old";

CREATE TYPE "BillingPlan" AS ENUM ('BASIC', 'ADVANCE');

ALTER TABLE "organizations"
    ALTER COLUMN "billing_plan" DROP DEFAULT,
    ALTER COLUMN "billing_plan" TYPE "BillingPlan" USING (
        CASE "billing_plan"::text
            WHEN 'FREE' THEN 'BASIC'
            WHEN 'STARTER' THEN 'BASIC'
            WHEN 'GROWTH' THEN 'ADVANCE'
            WHEN 'ENTERPRISE' THEN 'ADVANCE'
        END::"BillingPlan"
    ),
    ALTER COLUMN "billing_plan" SET DEFAULT 'BASIC';

DROP TYPE "BillingPlan_old";
