-- H13: migrate-deploy baseline / drift backstop
--
-- Context: shared/prod deploys already run `prisma migrate deploy` (Dockerfile,
-- render.yaml, root build:server). This migration is the cutover marker that
-- makes that the only supported path going forward — never `prisma db push`
-- on shared environments.
--
-- Partial unique indexes below are NOT expressible in schema.prisma. They
-- already ship in 20260729120000_manual_order_number_unique and
-- 20260729130000_one_active_invoice_per_order. Re-asserting with IF NOT EXISTS
-- is safe for:
--   * fresh DBs that run the full history
--   * older DBs that received tables via `db push` and may have skipped a
--     migration folder
--
-- Existing environments that already have these indexes: this migration is a
-- no-op. If a prior deploy failed mid-way and Prisma thinks this migration is
-- pending while objects already exist, mark it applied:
--
--   npx prisma migrate resolve --applied 20260729140000_h13_migrate_deploy_baseline
--
-- Pre-flight before first apply on a dirty DB (optional):
--
--   SELECT channel_id, order_number, COUNT(*) FROM orders
--   WHERE deleted_at IS NULL AND external_id LIKE 'manual\_%'
--   GROUP BY 1, 2 HAVING COUNT(*) > 1;
--
--   SELECT order_id, COUNT(*) FROM invoices
--   WHERE status <> 'CANCELLED' GROUP BY 1 HAVING COUNT(*) > 1;

-- Manual offline order numbers unique per channel (C5)
CREATE UNIQUE INDEX IF NOT EXISTS "orders_channel_id_order_number_manual_key"
  ON "orders"("channel_id", "order_number")
  WHERE "external_id" LIKE 'manual\_%';

-- At most one non-cancelled invoice per order (C7)
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_order_id_active_key"
  ON "invoices"("order_id")
  WHERE "status" <> 'CANCELLED';
