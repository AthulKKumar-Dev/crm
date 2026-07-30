-- Guarantee offline (MANUAL) order numbers are unique.
--
-- `createOfflineOrder` generates order numbers read-max-then-increment. Nothing
-- enforced uniqueness: `orders_channel_id_external_id_key` cannot catch a
-- collision because manual `external_id`s are `manual_<uuid>` (unique on every
-- attempt), and `orders_order_number_idx` is a plain index. Two concurrent
-- counter sales could therefore both commit the same order number.
--
-- PARTIAL index on manual orders only — deliberately NOT a full
-- (channel_id, order_number) unique:
--   * Shopify assigns its own order numbers and CAN re-issue them: a dev
--     store's test-data wipe resets its counter. Observed in live data —
--     store 9thara re-issued #1005–#1015 with new Shopify order ids after a
--     reset. A full unique would reject those genuine orders during sync, and
--     the webhook handler swallows failures, so they would be lost silently.
--   * Manual orders are exactly the rows created by the racy counter, and are
--     identified by their `manual_`-prefixed external_id.
--
-- Escaped LIKE pattern ('manual\_%') matches a literal underscore.
--
-- Pre-flight verified 2026-07-29 on the dev DB: zero duplicate
-- (channel_id, order_number) pairs among manual orders. Re-check with:
--
--   SELECT channel_id, order_number, COUNT(*) AS dupes, array_agg(id)
--   FROM orders
--   WHERE deleted_at IS NULL AND external_id LIKE 'manual\_%'
--   GROUP BY channel_id, order_number
--   HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_channel_id_order_number_manual_key"
  ON "orders"("channel_id", "order_number")
  WHERE "external_id" LIKE 'manual\_%';
