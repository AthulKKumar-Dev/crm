-- Store profile: the merchant's own business identity (trading name, address,
-- support phone / WhatsApp / email, website, logo URL).
--
-- Additive and nullable, like every other settings domain: the column stays
-- NULL until the merchant saves the Store Profile tab, and reads parse through
-- the Zod schema's defaults, so no backfill is needed and nothing breaks for an
-- org that never fills it in.
ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "store_profile_settings" JSONB;
