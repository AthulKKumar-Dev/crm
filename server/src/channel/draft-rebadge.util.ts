/**
 * Recognise a Shopify draft order the CRM itself created.
 *
 * A CRM draft lives on the MANUAL channel. `mirrorCreateToShopify` pushes it
 * with `draftOrderCreate` and only then writes Shopify's id back onto the row —
 * but Shopify fires `draft_orders/create` straight away, and the webhook
 * looked the draft up on the SHOPIFY channel, missed the MANUAL row, and
 * inserted a second copy. Every later push updated that copy.
 *
 * `buildShopifyInput` therefore stamps the local draft id on the Shopify draft
 * as a custom attribute. It comes back in the webhook as `note_attributes`,
 * which identifies the row even when the webhook beats the externalId write.
 * Same idea as `order-rebadge.util.ts` for pushed orders.
 */

export const CRM_DRAFT_ATTRIBUTE = 'collabo_crm_draft_id';

interface NoteAttribute {
  name?: string | null;
  key?: string | null;
  value?: string | number | null;
}

export interface DraftRebadgeCandidate {
  note_attributes?: NoteAttribute[] | null;
}

/**
 * The local draft id the payload carries, or null. Accepts the REST webhook
 * shape (`{ name, value }`) and the GraphQL one (`{ key, value }`).
 */
export function localDraftIdOf(sd: DraftRebadgeCandidate): string | null {
  if (!Array.isArray(sd.note_attributes)) return null;
  const attr = sd.note_attributes.find(
    (a) => (a?.name ?? a?.key) === CRM_DRAFT_ATTRIBUTE,
  );
  const value = attr?.value == null ? '' : String(attr.value).trim();
  return value || null;
}
