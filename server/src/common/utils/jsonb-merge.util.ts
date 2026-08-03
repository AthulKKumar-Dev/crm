import { Prisma } from '@prisma/client';

/**
 * Atomically merge keys into a row's JSONB `metadata` column.
 *
 * Replaces the unsafe read → spread → write pattern that loses concurrent
 * updates (two writers each snapshot the blob, then the slower overwrite
 * silently drops the faster writer's keys — e.g. shopifySync flipping
 * SYNCED → PENDING and triggering a second Shopify push).
 *
 * Postgres `||` on jsonb is last-key-wins per top-level key, so this only
 * patches the keys in `patch` and leaves every other metadata field intact.
 * Scoped by organization_id so a wrong id cannot cross tenants.
 *
 * `metadata` is normalised to an object first: `||` concatenates when either
 * side is an array (`[1,2] || {"a":1}` → `[1,2,{"a":1}]`) and array-wraps
 * scalars, so a non-object blob would be corrupted rather than patched. This
 * reproduces the `typeof current === 'object' && !Array.isArray(current)`
 * guard the read-modify-write callers used to apply in JS.
 *
 * Pass `guard` to make the merge conditional — a compare-and-set. The caller
 * checks the returned count to learn whether it won.
 *
 * Returns the number of rows updated (0 = missing / wrong org / guard failed).
 */
export async function mergeJsonMetadata(
  db: Prisma.TransactionClient | { $executeRaw: Prisma.TransactionClient['$executeRaw'] },
  table: 'orders' | 'products',
  id: string,
  organizationId: string,
  patch: Record<string, unknown>,
  guard: Prisma.Sql = Prisma.empty,
): Promise<number> {
  const patchJson = JSON.stringify(patch);

  // Table name is a fixed allowlist — never interpolate user input. `guard` is
  // a Prisma.Sql fragment built by callers from tagged templates, so any values
  // inside it stay parameterised.
  if (table === 'orders') {
    return db.$executeRaw`
      UPDATE "orders"
      SET "metadata" =
            CASE WHEN jsonb_typeof("metadata") = 'object'
                 THEN "metadata"
                 ELSE '{}'::jsonb
            END || ${patchJson}::jsonb,
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
        AND "organization_id" = ${organizationId}
        AND "deleted_at" IS NULL
        ${guard}
    `;
  }

  return db.$executeRaw`
    UPDATE "products"
    SET "metadata" =
          CASE WHEN jsonb_typeof("metadata") = 'object'
               THEN "metadata"
               ELSE '{}'::jsonb
          END || ${patchJson}::jsonb,
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}
      AND "organization_id" = ${organizationId}
      AND "deleted_at" IS NULL
      ${guard}
  `;
}
