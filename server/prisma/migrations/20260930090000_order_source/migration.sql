-- Record where an order was created within its channel.
--
-- An order only said which CHANNEL it belonged to ("Shopify"), not whether it
-- came from the online store, the POS, a draft order or this CRM. Shopify
-- reports that on every order and the sync already read it — but only to
-- detect CRM-pushed orders, never to store it.
--
-- `source_name` is Shopify's raw code; `source_label` is its display name for
-- the app that created the order. Both nullable with no backfill: existing
-- orders are filled the next time a sync touches them.
--
-- Guarded with IF NOT EXISTS: this schema has known drift from its migration
-- history, so migrations here must be safe to re-apply.

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "source_name" TEXT,
  ADD COLUMN IF NOT EXISTS "source_label" TEXT;
