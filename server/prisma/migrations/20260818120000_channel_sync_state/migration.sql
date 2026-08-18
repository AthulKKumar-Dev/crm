-- Per-entity sync bookkeeping + per-entity sync toggles.
--
-- WHY: the sync filter used to be a single channel-level watermark
-- (channels.last_synced_at) that only advanced when EVERY entity type
-- succeeded. One failing entity therefore forced a full rescan of all the
-- others on every BullMQ retry, and left the failing one permanently doing a
-- full-history scan. This table gives each entity its own watermark so a retry
-- resumes instead of restarting, and carries the merchant's per-entity
-- enable/disable toggle for both sync directions.
--
-- Hand-written (not `prisma migrate dev`) because this schema carries known
-- drift; every statement is guarded so it is safe to re-run.

CREATE TABLE IF NOT EXISTS "channel_sync_states" (
    "id"            TEXT NOT NULL,
    "channel_id"    TEXT NOT NULL,
    "direction"     TEXT NOT NULL DEFAULT 'pull',
    "entity_type"   TEXT NOT NULL,
    "enabled"       BOOLEAN NOT NULL DEFAULT true,
    "watermark"     TIMESTAMP(3),
    "backfill_done" BOOLEAN NOT NULL DEFAULT false,
    "window_start"  TIMESTAMP(3),
    "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_sync_states_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "channel_sync_states_channel_id_fkey" FOREIGN KEY ("channel_id")
        REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "channel_sync_states_channel_id_direction_entity_type_key"
    ON "channel_sync_states" ("channel_id", "direction", "entity_type");

CREATE INDEX IF NOT EXISTS "channel_sync_states_channel_id_idx"
    ON "channel_sync_states" ("channel_id");

-- ─── SEED: don't make healthy stores re-backfill ────────────────────────────
--
-- Without this every existing channel would look like "never backfilled" and
-- re-pull its whole catalogue on the next sync -- exactly the load this change
-- exists to remove, inflicted on stores that currently work.
--
-- `channels.last_synced_at` is stamped only when a run completed with every
-- entity succeeding, but that alone is NOT sufficient evidence: the degrade
-- path in paginateOrdersGraphql used `continue` inside a `do...while`, so a
-- fresh orders sync could report COMPLETED with zero records and no error --
-- which still stamped last_synced_at. Seeding on that would mark orders
-- "already backfilled" on a channel whose orders were never fetched, and the
-- backfill would then be skipped permanently.
--
-- So: seed per entity, and only where a sync log proves records actually
-- landed. Anything without that evidence gets no row and backfills properly on
-- the next sync. Erring toward "backfill again" is the safe direction -- the
-- upserts are idempotent, so a redundant backfill costs time, while a wrongly
-- skipped one loses data silently.
--
-- Only `pull` rows are seeded. Toggles read as "enabled unless a row says
-- otherwise", so push needs no seed to keep behaving as it does today.
INSERT INTO "channel_sync_states"
    ("id", "channel_id", "direction", "entity_type", "enabled", "watermark", "backfill_done", "updated_at")
SELECT
    gen_random_uuid()::text, c."id", 'pull', e.entity_type, true, c."last_synced_at", true, now()
FROM "channels" c
CROSS JOIN (VALUES ('products'), ('orders'), ('customers'), ('inventory'), ('collections'))
    AS e(entity_type)
WHERE c."platform" = 'SHOPIFY'
  AND c."last_synced_at" IS NOT NULL
  AND EXISTS (
      SELECT 1 FROM "sync_logs" sl
      WHERE sl."channel_id"  = c."id"
        AND sl."entity_type" = e.entity_type
        AND sl."status"      = 'COMPLETED'
        AND sl."records_processed" > 0
  )
ON CONFLICT ("channel_id", "direction", "entity_type") DO NOTHING;

-- ─── Invalidate saved pagination cursors ───────────────────────────────────
--
-- A Shopify cursor is only valid for the SAME connection arguments. The orders
-- `query` filter changes with this release (null -> created_at:>=...), so any
-- cursor saved by the old code would resume against a different result set.
UPDATE "sync_logs" SET "cursor" = NULL WHERE "status" <> 'COMPLETED';

-- ─── Unstick channels parked mid-sync ──────────────────────────────────────
--
-- A channel pinned at IN_PROGRESS makes POST /channels/:id/sync return 409 for
-- up to SYNC_RESUME_MAX_AGE_MS (6h). And `status` now means CONNECTION health
-- only -- sync outcomes live on `sync_status` -- so a leftover ERROR/SYNCING
-- from a failed backfill is permanently wrong.
UPDATE "sync_logs"
   SET "status" = 'FAILED',
       "completed_at" = now(),
       "error_message" = COALESCE("error_message",
           'Abandoned: still marked in progress at the channel_sync_state migration.')
 WHERE "status" = 'IN_PROGRESS';

UPDATE "channels" SET "sync_status" = 'IDLE' WHERE "sync_status" = 'IN_PROGRESS';

-- The credentials guard matters: a channel whose token was genuinely revoked
-- must stay DISCONNECTED so the UI keeps offering Reconnect.
UPDATE "channels"
   SET "status" = 'CONNECTED'
 WHERE "platform" = 'SHOPIFY'
   AND "status" IN ('ERROR', 'SYNCING')
   AND "credentials" IS NOT NULL;
