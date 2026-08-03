-- Inventory V1, migration 5/8: pick_tasks + lines.
--
-- One open fulfillment task per order: the partial unique below allows a new
-- task only once the prior one is DISPATCHED or CANCELLED (partial-pick
-- remainders re-open as a fresh task). Stock stays in the RESERVED bucket
-- through PICKED and PACKED; it exits (RESERVED → out) at dispatch.
-- order_id / order_line_item_id are plain strings for the same reconcile-prune
-- reason as stock_reservations.
--
-- Additive only; safe on a live database.

-- CreateTable
CREATE TABLE IF NOT EXISTS "pick_tasks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assignee_id" TEXT,
    "started_at" TIMESTAMP(3),
    "packed_at" TIMESTAMP(3),
    "dispatched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pick_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pick_task_lines" (
    "id" TEXT NOT NULL,
    "pick_task_id" TEXT NOT NULL,
    "order_line_item_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "qty_required" INTEGER NOT NULL,
    "qty_picked" INTEGER NOT NULL DEFAULT 0,
    "location_code" TEXT,

    CONSTRAINT "pick_task_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pick_task_lines_qty_required_pos" CHECK ("qty_required" > 0),
    CONSTRAINT "pick_task_lines_qty_picked_nonneg" CHECK ("qty_picked" >= 0)
);

-- Partial unique (Prisma cannot model): one open task per order.
CREATE UNIQUE INDEX IF NOT EXISTS "pick_tasks_order_id_open_key"
  ON "pick_tasks"("order_id")
  WHERE "status" NOT IN ('DISPATCHED', 'CANCELLED');

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pick_tasks_organization_id_status_idx" ON "pick_tasks"("organization_id", "status");
CREATE INDEX IF NOT EXISTS "pick_tasks_order_id_idx" ON "pick_tasks"("order_id");
CREATE INDEX IF NOT EXISTS "pick_task_lines_pick_task_id_idx" ON "pick_task_lines"("pick_task_id");
CREATE INDEX IF NOT EXISTS "pick_task_lines_variant_id_idx" ON "pick_task_lines"("variant_id");

-- AddForeignKey
ALTER TABLE "pick_tasks" ADD CONSTRAINT "pick_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pick_tasks" ADD CONSTRAINT "pick_tasks_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pick_task_lines" ADD CONSTRAINT "pick_task_lines_pick_task_id_fkey" FOREIGN KEY ("pick_task_id") REFERENCES "pick_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
