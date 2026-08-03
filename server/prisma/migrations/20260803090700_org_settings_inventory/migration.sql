-- Inventory V1, migration 8/8: inventory settings domain column.
--
-- Follows the documented OrganizationSettings pattern: one JSONB column per
-- settings domain, validated by a Zod schema in
-- server/src/organization-settings/schemas/. Every setting inside
-- (warehousingEnabled, qcOnReceiving, requireScanToPick, skuTemplate,
-- skuSequence, updateCostOnReceipt) lives in JSON — adding or changing settings
-- needs zero further migrations.
--
-- Additive only; safe on a live database.

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "inventory_settings" JSONB;
