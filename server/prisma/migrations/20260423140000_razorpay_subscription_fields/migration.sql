-- Razorpay subscription scaffold: rename Stripe-specific columns on Organization
-- to provider-agnostic names, add lifecycle columns, add pending-subscription
-- columns on User, and add two new enums.
--
-- The old Stripe columns are unused (no app code wrote to them), so the rename
-- is a pure DDL operation with no data migration.

-- ─── New enums ──────────────────────────────────────────────────────────────
CREATE TYPE "BillingProvider" AS ENUM ('RAZORPAY', 'MANUAL');

CREATE TYPE "SubscriptionStatus" AS ENUM (
    'CREATED',
    'AUTHENTICATED',
    'ACTIVE',
    'PAUSED',
    'HALTED',
    'CANCELLED',
    'COMPLETED',
    'EXPIRED'
);

-- ─── Organization: rename + add columns ─────────────────────────────────────
-- Drop old unique indexes before renaming the columns.
DROP INDEX IF EXISTS "organizations_stripe_customer_id_key";
DROP INDEX IF EXISTS "organizations_stripe_subscription_id_key";

ALTER TABLE "organizations"
    RENAME COLUMN "stripe_customer_id" TO "external_customer_id";

ALTER TABLE "organizations"
    RENAME COLUMN "stripe_subscription_id" TO "external_subscription_id";

ALTER TABLE "organizations"
    ADD COLUMN "billing_provider" "BillingProvider",
    ADD COLUMN "subscription_status" "SubscriptionStatus",
    ADD COLUMN "current_period_end" TIMESTAMP(3);

-- Recreate unique indexes on the renamed columns.
CREATE UNIQUE INDEX "organizations_external_customer_id_key"
    ON "organizations" ("external_customer_id");

CREATE UNIQUE INDEX "organizations_external_subscription_id_key"
    ON "organizations" ("external_subscription_id");

-- ─── User: pending subscription columns ─────────────────────────────────────
ALTER TABLE "users"
    ADD COLUMN "pending_billing_plan" "BillingPlan",
    ADD COLUMN "pending_billing_interval" "BillingInterval",
    ADD COLUMN "pending_external_customer_id" TEXT,
    ADD COLUMN "pending_external_subscription_id" TEXT,
    ADD COLUMN "pending_subscription_status" "SubscriptionStatus",
    ADD COLUMN "pending_current_period_end" TIMESTAMP(3);
