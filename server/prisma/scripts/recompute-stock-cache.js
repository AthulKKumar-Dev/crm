// Recompute product_variants.inventory_quantity from stock_levels.
//
// For a WAREHOUSING org the truth is stock_levels; inventory_quantity is only a
// cache that InventoryLedgerService.applyMovement refreshes as SUM(available)
// across warehouses. Two movements for one variant at DIFFERENT warehouses
// wrote different stock_levels rows, so nothing made them block, and each
// recomputed the cache from a snapshot missing the other — last commit wins
// with a stale total. Found 2026-09-04 across three orgs (Shrishti J's SJ965
// held 22 against a true 20). applyMovement now takes SELECT ... FOR UPDATE on
// the variant, which closes the race; this repairs rows that already drifted.
//
// LEGACY (non-warehousing) orgs are deliberately excluded: there
// inventory_quantity IS the source of truth and stock_levels is empty, so
// "recomputing" would zero every quantity they have.
//
// Dry run by default. Nothing is written without --apply.
//
//   node prisma/scripts/print-target.js && \
//     node prisma/scripts/recompute-stock-cache.js [--apply]

try {
  require('dotenv/config');
} catch {
  // Container: env already populated.
}

const { PrismaClient } = require('@prisma/client');

// A recompute is idempotent, but if stock_levels were truncated every variant
// would "drift" and this would zero the catalogue. Refuse that shape.
const MAX_DRIFT_RATIO = 0.2;

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

const prisma = new PrismaClient();

async function main() {
  console.log(`  Mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}\n`);

  const orgs = await prisma.$queryRawUnsafe(`
    SELECT os.organization_id AS id, o.name
    FROM organization_settings os
    JOIN organizations o ON o.id = os.organization_id
    WHERE (os.inventory_settings->>'warehousingEnabled')::boolean IS TRUE`);

  if (orgs.length === 0) {
    console.log('  No warehousing-enabled organisations. Nothing to do.\n');
    return;
  }
  console.log(`  Warehousing orgs: ${orgs.map((o) => o.name).join(', ')}\n`);

  const orgIds = orgs.map((o) => o.id);

  const drift = await prisma.$queryRawUnsafe(
    `
    WITH agg AS (
      SELECT v.id, v.sku, pr.title, pr.organization_id,
             v.inventory_quantity AS cached,
             COALESCE(SUM(sl.available), 0)::int AS truth
      FROM product_variants v
      JOIN products pr ON pr.id = v.product_id
      LEFT JOIN stock_levels sl ON sl.variant_id = v.id
      WHERE pr.deleted_at IS NULL AND pr.organization_id = ANY($1::text[])
      GROUP BY v.id, v.sku, pr.title, pr.organization_id, v.inventory_quantity
    )
    SELECT * FROM agg WHERE cached <> truth ORDER BY abs(truth - cached) DESC`,
    orgIds,
  );

  const [{ total }] = await prisma.$queryRawUnsafe(
    `
    SELECT count(*)::int AS total
    FROM product_variants v
    JOIN products pr ON pr.id = v.product_id
    WHERE pr.deleted_at IS NULL AND pr.organization_id = ANY($1::text[])`,
    orgIds,
  );

  console.log(`  Variants in scope: ${total}`);
  console.log(`  Drifted:           ${drift.length}\n`);

  if (drift.length === 0) {
    console.log('  Every cache already matches stock_levels.\n');
    return;
  }

  for (const d of drift.slice(0, 25)) {
    const sign = d.truth - d.cached > 0 ? '+' : '';
    console.log(
      `    ${String(d.sku ?? '(no sku)').padEnd(22)} ${String(d.cached).padStart(6)} → ` +
        `${String(d.truth).padStart(6)}  (${sign}${d.truth - d.cached})  ${d.title}`,
    );
  }
  if (drift.length > 25) console.log(`    … and ${drift.length - 25} more`);

  const ratio = drift.length / Math.max(total, 1);
  if (ratio > MAX_DRIFT_RATIO && !FORCE) {
    console.error(
      `\n  ${(ratio * 100).toFixed(1)}% of variants disagree with stock_levels, above the ` +
        `${MAX_DRIFT_RATIO * 100}% limit. That points at missing stock_levels rows rather ` +
        'than cache drift — investigate before recomputing. --force overrides.\n',
    );
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\n  DRY RUN — nothing written. Re-run with --apply.\n');
    return;
  }

  // Single statement: the subquery is re-evaluated per row, and the new
  // FOR UPDATE lock in applyMovement means a concurrent movement either waits
  // for this or is serialised behind it.
  const updated = await prisma.$executeRawUnsafe(
    `
    UPDATE product_variants v
    SET inventory_quantity = COALESCE(
      (SELECT SUM(sl.available)::int FROM stock_levels sl WHERE sl.variant_id = v.id), 0)
    FROM products pr
    WHERE pr.id = v.product_id
      AND pr.deleted_at IS NULL
      AND pr.organization_id = ANY($1::text[])
      AND v.inventory_quantity <> COALESCE(
        (SELECT SUM(sl.available)::int FROM stock_levels sl WHERE sl.variant_id = v.id), 0)`,
    orgIds,
  );
  console.log(`\n  Recomputed ${updated} variant cache(s).\n`);
}

main()
  .catch((e) => {
    console.error(`\n  ${e.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
