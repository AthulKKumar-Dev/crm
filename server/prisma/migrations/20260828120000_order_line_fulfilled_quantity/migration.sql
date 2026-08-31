-- Per-line fulfilled quantity.
--
-- `order_line_items.fulfillment_status` is a single string with no quantity
-- dimension, but Shopify's fulfillmentCreate accepts a per-line quantity and the
-- Fulfil dialog exposes it. Shipping 2 of 5 therefore flipped the whole line to
-- 'fulfilled' and — because the order-level status counts fulfilled LINES —
-- reported the order complete while 3 units were still unshipped.
--
-- Additive and idempotent (hand-written; see the migration-drift note in
-- docs/migration-recovery.md — do not regenerate this with `prisma migrate dev`).

ALTER TABLE "order_line_items"
  ADD COLUMN IF NOT EXISTS "fulfilled_quantity" INTEGER NOT NULL DEFAULT 0;

-- Backfill: any line already marked fulfilled or delivered was, under the old
-- all-or-nothing model, shipped in full. Guarded on the default so re-running
-- cannot overwrite quantities written by the new code.
UPDATE "order_line_items"
   SET "fulfilled_quantity" = "quantity"
 WHERE "fulfillment_status" IN ('fulfilled', 'delivered')
   AND "fulfilled_quantity" = 0;

-- Cannot ship more than was ordered, or a negative number.
ALTER TABLE "order_line_items"
  DROP CONSTRAINT IF EXISTS "order_line_items_fulfilled_quantity_range";
ALTER TABLE "order_line_items"
  ADD CONSTRAINT "order_line_items_fulfilled_quantity_range"
  CHECK ("fulfilled_quantity" >= 0 AND "fulfilled_quantity" <= "quantity");
