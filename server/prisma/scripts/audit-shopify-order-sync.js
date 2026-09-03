// Read-only audit of the manual-order → Shopify push path.
//
// Answers "are counter sales reaching Shopify, and are they coming back as
// ONE row?" for every organisation in the target database, plus the queue
// and Redis facts the push depends on. Writes nothing. Run via
// `npm run db:audit:shopify-orders`, which prints the target host first
// (server/.env is routinely repointed at production during deploys).
//
// Sections:
//   1. Manual orders by shopifySync.status, per org
//   2. PENDING claims older than the stale window (lost jobs)
//   3. Duplicates: a MANUAL row whose shopifyOrderId also exists as a SHOPIFY row
//   4. Rebadged rows (SHOPIFY channel carrying shopifySync) — proof the read-back works
//   5. Shopify channels: status, autoSyncToShopify, push toggles, webhook base URL
//   6. BullMQ `shopify-push` job counts and Redis maxmemory-policy

try {
  require('dotenv/config');
} catch {
  // Container: env already populated.
}

const { PrismaClient } = require('@prisma/client');

const STALE_PENDING_MINUTES = 15;

function section(title) {
  console.log(`\n-- ${title} ${'-'.repeat(Math.max(0, 70 - title.length))}`);
}

function table(rows) {
  if (!rows || rows.length === 0) {
    console.log('  (none)');
    return;
  }
  console.table(
    rows.map((r) => {
      const out = {};
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === 'bigint') out[k] = Number(v);
        else if (v instanceof Date) out[k] = v.toISOString();
        else if (v && typeof v === 'object') out[k] = JSON.stringify(v);
        else out[k] = v;
      }
      return out;
    }),
  );
}

async function redisReport() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log('  REDIS_URL is not set - the push queue cannot run at all.');
    return;
  }
  let IORedis;
  let Queue;
  try {
    IORedis = require('ioredis');
    ({ Queue } = require('bullmq'));
  } catch (err) {
    console.log(`  bullmq/ioredis not installed here (${err.message}) - skipping queue section.`);
    return;
  }
  const conn = new IORedis(url, {
    maxRetriesPerRequest: null,
    ...(url.startsWith('rediss') ? { tls: {} } : {}),
  });
  try {
    const q = new Queue('shopify-push', { connection: conn });
    const counts = await q.getJobCounts();
    console.log('  shopify-push job counts:', JSON.stringify(counts));
    const failed = await q.getFailed(0, 9);
    if (failed.length > 0) {
      table(
        failed.map((j) => ({
          id: j.id,
          name: j.name,
          orderId: j.data && j.data.orderId,
          org: j.data && j.data.organizationId,
          attempts: j.attemptsMade,
          reason: String(j.failedReason || '').slice(0, 120),
          finishedOn: j.finishedOn ? new Date(j.finishedOn) : null,
        })),
      );
    }
    await q.close();
    // Managed Redis (Upstash) answers CONFIG GET with an empty array or an
    // error; BullMQ prints its own "IMPORTANT! Eviction policy is ..." line
    // above in that case, which is the authoritative reading.
    let policy = '(not reported by the server - see BullMQ notice above, if any)';
    try {
      const cfg = await conn.config('GET', 'maxmemory-policy');
      const value = Array.isArray(cfg) ? cfg[1] : cfg;
      if (typeof value === 'string' && value.length > 0) policy = value;
    } catch (err) {
      policy = `(CONFIG GET not permitted: ${String(err && err.message).split('\n')[0]})`;
    }
    console.log(`  maxmemory-policy: ${policy}`);
    if (policy !== 'noeviction') {
      console.log(
        '  WARNING: BullMQ needs "noeviction" - any other policy can evict queued jobs, leaving orders PENDING with nothing to run.',
      );
    }
  } finally {
    await conn.quit().catch(() => undefined);
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    section('1. Manual orders by Shopify sync status (per org)');
    table(
      await prisma.$queryRawUnsafe(`
        SELECT o.organization_id AS org,
               COALESCE(o.metadata->'shopifySync'->>'status', '(never queued)') AS status,
               count(*)::int AS orders,
               max(o.created_at) AS newest
        FROM orders o JOIN channels c ON c.id = o.channel_id
        WHERE c.platform = 'MANUAL' AND o.deleted_at IS NULL
        GROUP BY 1, 2 ORDER BY 1, 2`),
    );

    section(`2. PENDING claims older than ${STALE_PENDING_MINUTES} min (lost or never-run jobs)`);
    table(
      await prisma.$queryRawUnsafe(`
        SELECT o.organization_id AS org, o.name, o.id,
               o.metadata->'shopifySync'->>'queuedAt' AS queued_at,
               o.metadata->'shopifySync'->>'attempts' AS attempts,
               o.updated_at
        FROM orders o JOIN channels c ON c.id = o.channel_id
        WHERE c.platform = 'MANUAL' AND o.deleted_at IS NULL
          AND o.metadata->'shopifySync'->>'status' = 'PENDING'
          AND COALESCE((o.metadata->'shopifySync'->>'queuedAt')::timestamptz, o.updated_at)
              < now() - interval '${STALE_PENDING_MINUTES} minutes'
        ORDER BY o.updated_at DESC LIMIT 50`),
    );

    section('3. Duplicates: pushed MANUAL row AND a separate SHOPIFY row for the same Shopify order');
    table(
      await prisma.$queryRawUnsafe(`
        SELECT m.organization_id AS org, m.name AS manual_row, m.id AS manual_id,
               s.name AS shopify_row, s.id AS shopify_id, s.external_id AS shopify_order_id,
               s.created_at AS shopify_row_created
        FROM orders m
        JOIN channels cm ON cm.id = m.channel_id AND cm.platform = 'MANUAL'
        JOIN orders s ON s.organization_id = m.organization_id
                     AND s.external_id = m.metadata->'shopifySync'->>'shopifyOrderId'
                     AND s.id <> m.id
        WHERE m.metadata->'shopifySync'->>'status' = 'SYNCED' AND m.deleted_at IS NULL
        ORDER BY s.created_at DESC LIMIT 100`),
    );

    section('4. Rebadged rows (SHOPIFY channel, still carrying shopifySync) - read-back proof');
    table(
      await prisma.$queryRawUnsafe(`
        SELECT o.organization_id AS org, o.name, o.external_id AS shopify_order_id,
               o.metadata->'shopifySync'->>'syncedAt' AS synced_at, o.updated_at
        FROM orders o JOIN channels c ON c.id = o.channel_id
        WHERE c.platform = 'SHOPIFY' AND o.metadata ? 'shopifySync' AND o.deleted_at IS NULL
        ORDER BY o.updated_at DESC LIMIT 50`),
    );

    section('5. Shopify channels and the settings the push depends on');
    table(
      await prisma.$queryRawUnsafe(`
        SELECT c.organization_id AS org, c.name, c.status, c.last_synced_at,
               COALESCE(s.order_settings->>'autoSyncToShopify', 'false') AS auto_sync_orders,
               (SELECT string_agg(entity_type, ',') FROM channel_sync_states x
                 WHERE x.channel_id = c.id AND x.direction = 'push' AND x.enabled = false) AS push_disabled,
               (SELECT max(watermark) FROM channel_sync_states x
                 WHERE x.channel_id = c.id AND x.direction = 'pull' AND x.entity_type = 'orders') AS orders_pull_watermark,
               c.credentials IS NOT NULL AS has_credentials
        FROM channels c
        LEFT JOIN organization_settings s ON s.organization_id = c.organization_id
        WHERE c.platform = 'SHOPIFY'
        ORDER BY c.last_synced_at DESC NULLS LAST`),
    );
    const appUrl = process.env.APP_URL || '(APP_URL unset)';
    console.log(`  Webhook base (APP_URL): ${appUrl}/api/v1/webhooks/shopify`);
    if (!appUrl.startsWith('https://')) {
      console.log(
        '  WARNING: webhooks are only registered against an HTTPS APP_URL; the rebadge never runs without them (or an orders pull).',
      );
    }

    section('6. Push queue (BullMQ shopify-push) and Redis');
    await redisReport();
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('audit failed:', err && err.message ? err.message : err);
  process.exit(1);
});
