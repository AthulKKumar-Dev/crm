# Shopify sync rollout — `channel_sync_state`

Operator steps for the release that adds per-entity sync watermarks, the 60-day
initial order window, and the connect/backfill split.

The migration `20260818120000_channel_sync_state` is **additive** (one new table)
and the currently-running code ignores it, so it is safe to apply before
deploying. It also carries the data repair: the backfill seed, the cursor
invalidation, and the unstick statements. What is *not* in it are the two
judgement calls below — run them first.

> **Check the database host before anything.** `server/.env` is repointed at
> production during deploys, so every `npx prisma …` from `server/` may be
> hitting prod. Run `node prisma/scripts/print-target.js` (or
> `npx prisma migrate status`) and read the host. `prisma db execute` does *not*
> echo the datasource — never rely on it to tell you where you are.

## 1. Audit the current sync state

Tells you, per channel and entity, whether the existing data can be trusted —
and therefore what the migration's seed will decide.

```sql
SELECT c.name, c.status, c.sync_status, c.last_synced_at,
       sl.entity_type, sl.status AS log_status,
       sl.records_processed, sl.records_failed, sl.total_estimated,
       sl.error_message, sl.started_at
FROM channels c
LEFT JOIN LATERAL (
  SELECT * FROM sync_logs s
  WHERE s.channel_id = c.id
  ORDER BY s.started_at DESC LIMIT 10
) sl ON true
WHERE c.platform = 'SHOPIFY'
ORDER BY c.name, sl.started_at DESC;
```

Two things to look for:

- **`log_status = 'COMPLETED'` with `records_processed = 0` while
  `total_estimated > 0`.** That is the signature of the pagination bug this
  release fixes: the entity looks synced but is empty. The seed already refuses
  to trust these (it requires `records_processed > 0`), so they will backfill.
- **The actual `error_message` on the failing orders log.** If it says
  `ACCESS_DENIED` rather than a cost or throttle error, the cause is Shopify's
  **Protected customer data access** approval, not anything in this release —
  order queries select `email`, `phone`, `customer` and addresses, product
  queries do not. Request it in the Partner Dashboard; see
  [shopify-app-setup.md](shopify-app-setup.md).

Cross-check the row counts against the store's real totals in the Shopify admin
before trusting any `backfill_done` the seed writes:

```sql
SELECT c.name, count(o.id) AS orders
FROM channels c LEFT JOIN orders o ON o.channel_id = c.id AND o.deleted_at IS NULL
WHERE c.platform = 'SHOPIFY' GROUP BY c.name;
```

## 2. ⚠️ Count what the first successful sync will PUSH to Shopify

The push has been failing alongside the pull. Once the pull succeeds,
`bulkPushUnsyncedOrders` sends **every** manual order never marked `SYNCED`, and
each becomes a real order in the merchant's Shopify admin via `orderCreate`.
On a store that has been taking counter sales with auto-sync off that can be a
large, surprising batch — and **a Shopify order cannot be un-created.**

```sql
SELECT o.organization_id, count(*) AS pending_push
FROM orders o
JOIN channels c ON c.id = o.channel_id
WHERE c.platform = 'MANUAL'
  AND o.deleted_at IS NULL
  AND coalesce(o.metadata->'shopifySync'->>'status', '') <> 'SYNCED'
GROUP BY o.organization_id;
```

If the count is not what the merchant expects, switch that org's push off before
the first sync and let them opt back in once they have seen the number:

```sql
INSERT INTO channel_sync_states
  (id, channel_id, direction, entity_type, enabled, updated_at)
SELECT gen_random_uuid()::text, c.id, 'push', e.entity_type, false, now()
FROM channels c
CROSS JOIN (VALUES ('orders'), ('products'), ('drafts')) AS e(entity_type)
WHERE c.organization_id = '<ORG_ID>' AND c.platform IN ('SHOPIFY', 'MANUAL')
ON CONFLICT ("channel_id", "direction", "entity_type") DO UPDATE SET enabled = false;
```

Toggles read as *enabled unless a row says otherwise*, so no rows means today's
behaviour is preserved — you only need to write rows to turn something **off**.

## 3. Apply and deploy

```bash
cd server && npx prisma migrate deploy
```

Then deploy the server. Confirm afterwards:

- `SELECT count(*) FROM channel_sync_states;` is non-zero for stores that had a
  healthy sync, and has **no** rows for the store that was failing.
- `SELECT id, status, sync_status FROM channels WHERE platform = 'SHOPIFY';` —
  no channel is left on `ERROR`/`SYNCING` with credentials present, and none is
  pinned at `sync_status = 'IN_PROGRESS'`.

## 4. Verify the fix on the live store

1. Trigger a sync from the Channels page and watch `sync_logs` advance. The
   channel must stay `CONNECTED` throughout — sync outcomes now live on
   `sync_status`, not `status`.
2. Confirm the window: orders in the DB for that channel should match the
   store's orders created in the last 60 days
   (`SHOPIFY_INITIAL_ORDER_WINDOW_DAYS`, default 60).
3. Trigger a **second** sync a minute later. The logs should show each entity
   filtering on `updated_at:>=…` and processing almost nothing — that is the
   watermark working, and the thing that stops retries re-scanning the store.
4. With the logger at `debug`, read the `Shopify cost … bucket=…/… restore=…/s`
   line for the new orders query. It must sit comfortably under 1,000.
