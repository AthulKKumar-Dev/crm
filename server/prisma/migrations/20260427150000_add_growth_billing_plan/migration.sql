-- Add GROWTH tier to the BillingPlan enum, between BASIC and ADVANCE.
-- Postgres requires this in its own transaction (cannot ADD VALUE inside a
-- larger DDL transaction), so this migration is intentionally minimal.
ALTER TYPE "BillingPlan" ADD VALUE 'GROWTH' BEFORE 'ADVANCE';
