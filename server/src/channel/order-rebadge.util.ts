/**
 * Decide whether an incoming Shopify order payload is one the CRM itself
 * pushed (an offline / counter sale sent up via `ShopifyPushService.pushOrder`).
 *
 * `pushOrder` stamps three markers on the Shopify order:
 *   - `sourceIdentifier` = the local order id (a cuid)
 *   - `sourceName`       = `collabo-crm`
 *   - `tags`             ⊇ [`collabo-crm`, `offline`, `pos`]
 *
 * The identifier is the one that matters: a cuid cannot collide with any id
 * another platform would put there, and the caller additionally restricts the
 * lookup to orders on the MANUAL channel. `sourceName` is only a second
 * opinion — Shopify documents that a custom value leaves the order
 * "unattributed" and that an unspecified one is replaced with the app id, so
 * the exact string is not something to bet duplicate rows on. Accept the tag
 * as an equivalent marker so a store that rewrites `source_name` still
 * rebadges instead of inserting a second copy of every counter sale.
 *
 * Accepts both shapes that reach `upsertOrder`: the REST webhook payload
 * (`source_identifier`, `source_name`, `tags` as a comma string) and the
 * GraphQL pull already mapped to the same keys (`tags` joined with ', ').
 */

export const CRM_SOURCE_NAME = 'collabo-crm';

export interface RebadgeCandidate {
  source_identifier?: string | number | null;
  source_name?: string | null;
  tags?: string | string[] | null;
}

function tagList(tags: RebadgeCandidate['tags']): string[] {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  if (typeof tags === 'string') return tags.split(',').map((t) => t.trim()).filter(Boolean);
  return [];
}

/** The local order id the payload claims to originate from, or null. */
export function localOrderIdOf(so: RebadgeCandidate): string | null {
  const raw = so.source_identifier;
  if (raw === null || raw === undefined) return null;
  const id = String(raw).trim();
  return id.length > 0 ? id : null;
}

/**
 * True when the payload carries the CRM's own marker — by `source_name` or by
 * tag. Deliberately does NOT require `source_identifier`; callers combine the
 * two so they can log the exact mismatch (identifier present but marker
 * absent) rather than silently duplicating.
 */
export function carriesCrmMarker(so: RebadgeCandidate): boolean {
  const name = (so.source_name ?? '').trim();
  if (name === CRM_SOURCE_NAME) return true;
  return tagList(so.tags).includes(CRM_SOURCE_NAME);
}

/**
 * Payload is a locally-pushed order: it names a local order AND either carries
 * the CRM marker or has no `source_name` at all (older pushes set nothing).
 */
export function isLocallyPushedPayload(so: RebadgeCandidate): boolean {
  if (!localOrderIdOf(so)) return false;
  const name = (so.source_name ?? '').trim();
  return name === '' || carriesCrmMarker(so);
}
