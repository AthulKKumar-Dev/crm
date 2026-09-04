// Soft-delete CRM products that no longer exist in Shopify.
//
// Why this exists: `products/delete` used to write `status = 'ARCHIVED'`
// instead of `deletedAt`, so every product ever deleted in Shopify stayed in
// the CRM catalogue forever. Found on 2026-09-04 for Shrishti Jewels: Shopify
// held 3,538 products and 0 archived; the CRM held 3,668 with 128 ARCHIVED —
// all 128 deleted upstream, plus 2 drafts. The webhook is fixed, but rows that
// drifted before the fix need reconciling once.
//
// Authoritative by construction: it pages EVERY product id out of Shopify and
// soft-deletes any CRM row whose externalId is absent from that set. Status is
// never consulted, so it catches drift in any status.
//
// Dry run by default. Nothing is written without --apply.
//
//   node prisma/scripts/print-target.js && \
//     node prisma/scripts/reconcile-shopify-products.js --channel=<id> [--apply]

try {
  require('dotenv/config');
} catch {
  // Container: env already populated.
}

const CryptoJS = require('crypto-js');
const { PrismaClient } = require('@prisma/client');

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-01';

// Refuse to soft-delete more than this share of a catalogue in one run. A
// partial Shopify read (throttle, expired token mid-page, a network blip) would
// otherwise look exactly like "the merchant deleted everything".
const MAX_DELETE_RATIO = 0.2;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const channelArg = args.find((a) => a.startsWith('--channel='));

const prisma = new PrismaClient();

async function shopifyGraphql(shop, token, query, variables) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(
      `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ query, variables }),
      },
    );
    if (res.status === 401) {
      throw new Error(
        'Shopify returned 401. The stored access token has expired — run a ' +
          'sync from Settings → Channels to refresh it, then re-run this script.',
      );
    }
    const body = await res.json();
    if (body.errors) {
      const text = JSON.stringify(body.errors);
      if (text.includes('THROTTLED')) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw new Error(`Shopify GraphQL error: ${text.slice(0, 400)}`);
    }
    return body.data;
  }
  throw new Error('Shopify kept throttling; giving up rather than reading a partial catalogue.');
}

const PRODUCT_IDS_QUERY = `
  query($after: String) {
    products(first: 250, after: $after) {
      nodes { id }
      pageInfo { hasNextPage endCursor }
    }
  }`;

async function main() {
  if (!channelArg) {
    console.error('\n  --channel=<channelId> is required.\n');
    process.exit(1);
  }
  const channelId = channelArg.split('=')[1];

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error(`Channel ${channelId} not found.`);
  if (channel.platform !== 'SHOPIFY') {
    throw new Error(`Channel ${channelId} is ${channel.platform}, not SHOPIFY.`);
  }
  const creds = channel.credentials;
  if (!creds?.accessToken) throw new Error(`Channel ${channelId} has no stored credentials.`);

  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY is not set — cannot decrypt the access token.');
  const token = CryptoJS.AES.decrypt(creds.accessToken, key).toString(CryptoJS.enc.Utf8);
  if (!token) throw new Error('Access token decrypted to empty — ENCRYPTION_KEY does not match this row.');

  const shop = creds.shopDomain;
  console.log(`  Shop:         ${shop}`);
  console.log(`  Organisation: ${channel.organizationId}`);
  console.log(`  Mode:         ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}\n`);

  // ---- every live product id in Shopify ----
  const live = new Set();
  let after = null;
  let pages = 0;
  do {
    const data = await shopifyGraphql(shop, token, PRODUCT_IDS_QUERY, { after });
    for (const n of data.products.nodes) live.add(n.id.split('/').pop());
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
    pages++;
  } while (after);
  console.log(`  Shopify: ${live.size} product(s) over ${pages} page(s)`);

  if (live.size === 0) {
    throw new Error('Shopify returned zero products — refusing to treat that as "delete everything".');
  }

  // ---- CRM products not present upstream ----
  const crm = await prisma.product.findMany({
    where: { organizationId: channel.organizationId, channelId, deletedAt: null },
    select: { id: true, externalId: true, title: true, status: true },
  });
  console.log(`  CRM:     ${crm.length} product(s) not soft-deleted`);

  const stale = crm.filter((p) => p.externalId && !live.has(p.externalId));
  console.log(`  Stale:   ${stale.length} product(s) absent from Shopify\n`);

  if (stale.length === 0) {
    console.log('  Nothing to reconcile.\n');
    return;
  }

  const byStatus = {};
  for (const p of stale) byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  console.log('  By status:', JSON.stringify(byStatus));
  console.log('  Sample:');
  for (const p of stale.slice(0, 15)) {
    console.log(`    ${p.externalId.padEnd(16)} ${p.status.padEnd(9)} ${p.title}`);
  }
  if (stale.length > 15) console.log(`    … and ${stale.length - 15} more`);

  const ratio = stale.length / crm.length;
  if (ratio > MAX_DELETE_RATIO && !FORCE) {
    console.error(
      `\n  ${(ratio * 100).toFixed(1)}% of the catalogue is missing upstream, above the ` +
        `${MAX_DELETE_RATIO * 100}% safety limit. That usually means a partial Shopify read, ` +
        'not a real deletion. Re-run and pass --force only if the number is genuinely correct.\n',
    );
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\n  DRY RUN — nothing written. Re-run with --apply to soft-delete these.\n');
    return;
  }

  const now = new Date();
  const result = await prisma.product.updateMany({
    where: { id: { in: stale.map((p) => p.id) } },
    data: { deletedAt: now },
  });
  console.log(`\n  Soft-deleted ${result.count} product(s) at ${now.toISOString()}.\n`);
}

main()
  .catch((e) => {
    console.error(`\n  ${e.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
