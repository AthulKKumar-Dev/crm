-- Multi-location: at most ONE warehouse per (organization, Shopify location).
--
-- Until now exactly one warehouse per org could carry a shopify_location_id —
-- InventoryService.enable() set it on the default warehouse from the cached
-- Channel.metadata.shopifyLocationId, and CreateWarehouseDto has no such field,
-- so nothing else could ever write one. Multi-location changes that: the
-- location sync now auto-creates one warehouse per Shopify location and
-- re-resolves them on every run by (organization_id, shopify_location_id).
--
-- That lookup is the mapping's identity — a duplicate would make the sync pick
-- an arbitrary warehouse and split one location's stock across two rows. This
-- index makes that unrepresentable, and turns a lost create race in
-- syncLocations into a P2002 the service recovers from (same pattern as
-- InventoryLedgerService.ensureLevel).
--
-- PARTIAL on NOT NULL so hand-created warehouses, which have no Shopify
-- location, remain unconstrained — SQL NULLs would not collide anyway, but the
-- partial index also keeps it off every manual row.
--
-- Pre-flight: expected to return zero rows on any database, for the reason
-- above. Re-check before deploying with:
--
--   SELECT organization_id, shopify_location_id, COUNT(*) AS dupes,
--          array_agg(code) AS warehouse_codes
--   FROM warehouses
--   WHERE shopify_location_id IS NOT NULL
--   GROUP BY organization_id, shopify_location_id
--   HAVING COUNT(*) > 1;
--
-- Additive only; no existing row is modified. Safe on a live database.

CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_org_shopify_location_key"
  ON "warehouses"("organization_id", "shopify_location_id")
  WHERE "shopify_location_id" IS NOT NULL;
