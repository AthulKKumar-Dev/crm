-- One Shopify store URL may be claimed by at most one organization.
--
-- (platform, external_store_id) is already UNIQUE in this database, but the
-- webhook router resolves tenants by external_store_URL, so the guarantee did
-- not cover the column actually used for routing. Without it, two orgs holding
-- the same URL would make tenant selection depend on row order — and HMAC
-- cannot disambiguate, because it is verified against the app-level client
-- secret that is valid for every store installed on the app.
--
-- Partial (WHERE NOT NULL) because a disconnected channel legitimately holds
-- NULLs, and Postgres treats NULLs as distinct — a plain unique would not
-- constrain them anyway.
--
-- Pre-flight verified 2026-07-30 on the dev DB: zero URLs claimed by more than
-- one organization. Re-check before applying elsewhere:
--
--   SELECT external_store_url, COUNT(*), array_agg(organization_id)
--   FROM channels
--   WHERE platform = 'SHOPIFY' AND external_store_url IS NOT NULL
--   GROUP BY external_store_url
--   HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "channels_platform_external_store_url_key"
  ON "channels"("platform", "external_store_url")
  WHERE "external_store_url" IS NOT NULL;
