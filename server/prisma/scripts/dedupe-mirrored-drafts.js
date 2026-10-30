// Soft-delete the duplicate drafts the draft_orders webhook used to create.
//
// A draft made in the CRM lives on the MANUAL channel. Once mirrored to
// Shopify, the draft_orders/create webhook looked it up on the SHOPIFY
// channel, missed it, and inserted a second DraftOrder with the same Shopify
// id; every later push then updated that copy. The webhook now finds the CRM
// row (see src/channel/draft-rebadge.util.ts). This removes the copies it
// already made.
//
// A duplicate is a live draft on a SHOPIFY channel whose Shopify id
// (externalId) is also held by a live draft on a non-Shopify channel in the
// same org. The CRM row is kept; the copy gets deletedAt. A copy linked to an
// order (completedOrderId) is reported and left alone.
//
// Dry run by default. Nothing is written without --apply.
//
//   npm run db:fix:dedupe-mirrored-drafts -- --apply

try {
  require('dotenv/config');
} catch {
  // Container: env already populated.
}

const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

(async () => {
  const copies = await prisma.draftOrder.findMany({
    where: {
      deletedAt: null,
      externalId: { not: null },
      channel: { platform: 'SHOPIFY' },
    },
    select: {
      id: true,
      organizationId: true,
      externalId: true,
      name: true,
      status: true,
      completedOrderId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const toDelete = [];
  const linked = [];

  for (const copy of copies) {
    const original = await prisma.draftOrder.findFirst({
      where: {
        organizationId: copy.organizationId,
        externalId: copy.externalId,
        deletedAt: null,
        id: { not: copy.id },
        channel: { platform: { not: 'SHOPIFY' } },
      },
      select: { id: true, name: true, status: true },
    });
    if (!original) continue;

    const line =
      `    org ${copy.organizationId}  shopify ${copy.externalId.padEnd(14)} ` +
      `keep ${original.id} (${original.name ?? '-'}, ${original.status})  ` +
      `copy ${copy.id} (${copy.name ?? '-'}, ${copy.status})`;

    if (copy.completedOrderId) {
      linked.push(line);
    } else {
      toDelete.push({ id: copy.id, line });
    }
  }

  if (toDelete.length === 0 && linked.length === 0) {
    console.log('\n  No duplicate mirrored drafts.\n');
    await prisma.$disconnect();
    return;
  }

  if (toDelete.length > 0) {
    console.log(`\n  ${toDelete.length} duplicate draft(s):`);
    for (const d of toDelete) console.log(d.line);
  }
  if (linked.length > 0) {
    console.log(`\n  ${linked.length} duplicate(s) linked to an order — left alone, check by hand:`);
    for (const l of linked) console.log(l);
  }

  if (APPLY && toDelete.length > 0) {
    const { count } = await prisma.draftOrder.updateMany({
      where: { id: { in: toDelete.map((d) => d.id) }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    console.log(`\n  ${count} duplicate(s) soft-deleted.\n`);
  } else if (toDelete.length > 0) {
    console.log(`\n  ${toDelete.length} duplicate(s) would be soft-deleted — re-run with --apply.\n`);
  }

  await prisma.$disconnect();
})().catch(async (err) => {
  console.error('\n  FAILED:', err.message, '\n');
  await prisma.$disconnect();
  process.exit(1);
});
