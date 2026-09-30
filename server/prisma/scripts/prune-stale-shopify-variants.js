// Delete local variants that their Shopify product no longer has.
//
// `upsertProduct` used to only upsert the variants a payload carried, so a
// variant Shopify REPLACED (deleted + recreated — typically a new product's
// default variant swapped for a priced one a second later) lived on locally as
// a ₹0, SKU-less "Default Title" twin: "2 variants · ₹0.00 – ₹799.00". The sync
// now prunes them going forward (see shopify-variant-prune.util.ts); this
// clears the ones already stored. Found 2026-09-30: 381 on Shrishti J.
//
// The truth is fetched live from Shopify, never inferred from local data:
// every product and its variant ids, via Admin GraphQL QUERIES only. A variant
// is a candidate only when its product exists in Shopify, that product's
// variant list came back complete, and the variant's id is not in it.
//
// A candidate still holding stock (any non-zero StockLevel bucket) is reported
// and never deleted — those units are a merchant decision, not a cleanup.
// Order lines survive a delete (variant_id SET NULL, title/SKU on the line).
//
// Dry run by default, and a dry run is read-only by construction: every DB read
// runs in a READ ONLY transaction that is asserted and rolled back.
//
// The Shopify token is used as stored and NEVER refreshed (a refresh writes the
// rotated token back). If it is about to expire the script stops; the app
// refreshes it on its next Shopify call — run again after that.
//
//   npm run db:fix:prune-stale-shopify-variants -- --org=<organizationId>
//   npm run db:fix:prune-stale-shopify-variants -- --org=<organizationId> --apply

try {
  require('dotenv/config');
} catch {
  // Container: env already populated.
}

const { PrismaClient, Prisma } = require('@prisma/client');
const CryptoJS = require('crypto-js');

const APPLY = process.argv.includes('--apply');
const ORG = (process.argv.find((a) => a.startsWith('--org=')) || '').slice('--org='.length);
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-01';

const prisma = new PrismaClient();

// ─── Read-only DB access ───────────────────────────────────────────────────

const ROLLBACK = new Error('__rollback__');

/** Runs `fn` in a READ ONLY transaction (asserted), always rolled back. */
async function readOnly(fn) {
  let out;
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const [row] = await tx.$queryRawUnsafe('SHOW transaction_read_only');
        if (!row || row.transaction_read_only !== 'on') {
          throw new Error('Refusing to continue: transaction is not read-only.');
        }
        out = await fn(tx);
        throw ROLLBACK;
      },
      {
        timeout: 120000,
        maxWait: 20000,
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return out;
}

// ─── Shopify (queries only) ────────────────────────────────────────────────

async function shopify(auth, query, variables) {
  if (/\bmutation\b/i.test(query)) throw new Error('Refusing to send a mutation.');
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(
      `https://${auth.shopDomain}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': auth.token },
        body: JSON.stringify({ query, variables: variables || {} }),
        signal: AbortSignal.timeout(60000),
      },
    );
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Shopify ${res.status} — token rejected. Run again after the app has refreshed it.`);
    }
    const throttled = (body.errors || []).some((e) => e.extensions && e.extensions.code === 'THROTTLED');
    if (throttled || res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!body.data) throw new Error(`Shopify error: ${JSON.stringify(body.errors).slice(0, 300)}`);
    const t = body.extensions && body.extensions.cost && body.extensions.cost.throttleStatus;
    if (t && t.currentlyAvailable < t.maximumAvailable * 0.3) {
      await new Promise((r) => setTimeout(r, 3000));
    }
    return body.data;
  }
  throw new Error('Shopify: gave up after retries.');
}

/** Map of Shopify product id → Set of live variant ids, plus truncated product ids. */
async function liveCatalogue(auth) {
  const live = new Map();
  const truncated = new Set();
  let after = null;
  let pages = 0;
  do {
    const data = await shopify(
      auth,
      `query($after: String) {
        products(first: 100, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            legacyResourceId
            variants(first: 100) { pageInfo { hasNextPage } nodes { legacyResourceId } }
          }
        }
      }`,
      { after },
    );
    for (const p of data.products.nodes) {
      live.set(p.legacyResourceId, new Set(p.variants.nodes.map((v) => v.legacyResourceId)));
      if (p.variants.pageInfo.hasNextPage) truncated.add(p.legacyResourceId);
    }
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
    pages++;
  } while (after && pages < 1000);
  return { live, truncated };
}

/** One product's live variant ids, fetched fresh (null = product gone or truncated). */
async function liveVariantsOf(auth, productExternalId) {
  const data = await shopify(
    auth,
    `query($id: ID!) {
      product(id: $id) {
        variants(first: 100) { pageInfo { hasNextPage } nodes { legacyResourceId } }
      }
    }`,
    { id: `gid://shopify/Product/${productExternalId}` },
  );
  if (!data.product || data.product.variants.pageInfo.hasNextPage) return null;
  return new Set(data.product.variants.nodes.map((v) => v.legacyResourceId));
}

// ─── Main ──────────────────────────────────────────────────────────────────

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '(unparseable)';
  }
}

function pad(value, width) {
  const s = value == null ? '' : String(value);
  return s.length > width ? s.slice(0, width - 1) + '…' : s.padEnd(width);
}

async function main() {
  if (!ORG) {
    console.error('Usage: --org=<organizationId> [--apply]');
    process.exit(1);
  }
  if (!process.env.ENCRYPTION_KEY) {
    console.error('ENCRYPTION_KEY is not set — cannot read the Shopify token.');
    process.exit(1);
  }

  console.log(`\n  Target DB : ${hostOf(process.env.DATABASE_URL)}`);
  console.log(`  Org       : ${ORG}`);
  console.log(`  Mode      : ${APPLY ? 'APPLY — variants WILL be deleted' : 'DRY RUN — nothing will be written'}\n`);

  const { org, channels } = await readOnly(async (tx) => ({
    org: (await tx.$queryRawUnsafe(`SELECT id, name FROM organizations WHERE id = $1`, ORG))[0],
    channels: await tx.$queryRawUnsafe(
      `SELECT id, name, credentials::jsonb AS c FROM channels
        WHERE organization_id = $1 AND platform = 'SHOPIFY' AND status = 'CONNECTED'`,
      ORG,
    ),
  }));
  if (!org) throw new Error(`No organization ${ORG}.`);
  if (channels.length === 0) throw new Error(`${org.name} has no connected Shopify channel.`);
  console.log(`  Org name  : ${org.name}`);

  const totals = { candidates: 0, deletable: 0, hasStock: 0, deleted: 0, skippedNowLive: 0, skippedStock: 0, failed: 0 };

  for (const ch of channels) {
    const c = ch.c || {};
    if (c.accessTokenExpiresAt) {
      const minsLeft = (new Date(c.accessTokenExpiresAt).getTime() - Date.now()) / 60000;
      if (minsLeft < 5) {
        throw new Error(
          `Shopify token for "${ch.name}" expires in ${minsLeft.toFixed(1)} min. ` +
            'Not refreshing it (that would write). Run again once the app has refreshed it.',
        );
      }
    }
    const auth = {
      shopDomain: c.shopDomain,
      token: CryptoJS.AES.decrypt(c.accessToken, process.env.ENCRYPTION_KEY).toString(CryptoJS.enc.Utf8),
    };
    if (!auth.shopDomain || !auth.token) throw new Error(`Could not read credentials for "${ch.name}".`);

    console.log(`\n  Channel   : ${ch.name} (${auth.shopDomain}) — reading Shopify catalogue…`);
    const { live, truncated } = await liveCatalogue(auth);

    const rows = await readOnly((tx) =>
      tx.$queryRawUnsafe(
        `SELECT p.external_id AS product_ext, p.title AS product, v.id, v.external_id AS variant_ext,
                v.title AS variant, v.sku, v.price::text AS price,
                (SELECT count(*) FROM order_line_items li WHERE li.variant_id = v.id)::int AS order_lines,
                EXISTS (SELECT 1 FROM stock_levels sl WHERE sl.variant_id = v.id
                         AND (sl.available <> 0 OR sl.reserved <> 0 OR sl.qc <> 0 OR sl.damaged <> 0)) AS has_stock,
                COALESCE((SELECT SUM(sl.on_hand) FROM stock_levels sl WHERE sl.variant_id = v.id), 0)::int AS on_hand
           FROM products p JOIN product_variants v ON v.product_id = p.id
          WHERE p.organization_id = $1 AND p.channel_id = $2 AND p.deleted_at IS NULL
            AND p.external_id IS NOT NULL AND v.external_id IS NOT NULL
          ORDER BY p.title, v.position`,
        ORG,
        ch.id,
      ),
    );

    const candidates = rows.filter((r) => {
      const variants = live.get(r.product_ext);
      return variants && !truncated.has(r.product_ext) && !variants.has(r.variant_ext);
    });
    const localProducts = new Set(rows.map((r) => r.product_ext));
    const notInShopify = [...localProducts].filter((id) => !live.has(id)).length;

    console.log(`  Shopify products: ${live.size}  (variant list truncated: ${truncated.size})`);
    console.log(`  Local products  : ${localProducts.size}  (not in Shopify, left alone: ${notInShopify})`);
    console.log(`  Stale variants  : ${candidates.length}\n`);

    console.log(
      `  ${pad('ACTION', 18)}${pad('PRODUCT', 38)}${pad('VARIANT', 16)}${pad('SKU', 12)}${pad('PRICE', 10)}${pad('ON HAND', 8)}SHOPIFY VARIANT`,
    );
    for (const r of candidates) {
      const action = r.has_stock ? 'KEEP (has stock)' : APPLY ? 'DELETE' : 'WOULD DELETE';
      console.log(
        `  ${pad(action, 18)}${pad(r.product, 38)}${pad(r.variant, 16)}${pad(r.sku, 12)}${pad(r.price, 10)}${pad(r.on_hand, 8)}${r.variant_ext}`,
      );
    }

    totals.candidates += candidates.length;
    totals.hasStock += candidates.filter((r) => r.has_stock).length;
    const deletable = candidates.filter((r) => !r.has_stock);
    totals.deletable += deletable.length;

    if (!APPLY) continue;

    // Re-check each product against Shopify immediately before touching it.
    const byProduct = new Map();
    for (const r of deletable) {
      if (!byProduct.has(r.product_ext)) byProduct.set(r.product_ext, []);
      byProduct.get(r.product_ext).push(r);
    }
    for (const [productExt, doomed] of byProduct) {
      const fresh = await liveVariantsOf(auth, productExt);
      for (const r of doomed) {
        if (!fresh || fresh.has(r.variant_ext)) {
          totals.skippedNowLive++;
          console.log(`  skip   ${r.id} — Shopify state changed since the listing`);
          continue;
        }
        try {
          await prisma.$transaction(async (tx) => {
            const stock = await tx.stockLevel.findFirst({
              where: {
                variantId: r.id,
                OR: [{ available: { not: 0 } }, { reserved: { not: 0 } }, { qc: { not: 0 } }, { damaged: { not: 0 } }],
              },
              select: { id: true },
            });
            if (stock) {
              const err = new Error('has stock');
              err.code = 'HAS_STOCK';
              throw err;
            }
            await tx.stockLevel.deleteMany({ where: { variantId: r.id } });
            await tx.productVariant.delete({ where: { id: r.id } });
          });
          totals.deleted++;
        } catch (err) {
          if (err.code === 'HAS_STOCK') {
            totals.skippedStock++;
            console.log(`  skip   ${r.id} — gained stock since the listing`);
          } else {
            totals.failed++;
            console.log(`  FAIL   ${r.id} — ${err.message}`);
          }
        }
      }
    }
  }

  console.log('\n  ── Summary ─────────────────────────────────────────────');
  console.log(`  Stale variants found        : ${totals.candidates}`);
  console.log(`  Deletable (no stock)        : ${totals.deletable}`);
  console.log(`  Kept — still hold stock     : ${totals.hasStock}`);
  if (APPLY) {
    console.log(`  Deleted                     : ${totals.deleted}`);
    console.log(`  Skipped — Shopify changed   : ${totals.skippedNowLive}`);
    console.log(`  Skipped — gained stock      : ${totals.skippedStock}`);
    console.log(`  Failed                      : ${totals.failed}`);
  } else {
    console.log('\n  Dry run — nothing was written. Re-run with --apply to delete the deletable rows.');
  }
  console.log('');
}

main()
  .catch((err) => {
    console.error(`\n  prune failed: ${err && err.message ? err.message : err}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
