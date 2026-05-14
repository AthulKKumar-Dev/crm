export const DRAFT_MIRROR_QUEUE = 'draft-mirror';

/**
 * Discriminated union of draft-mirror jobs. The processor switches on
 * `type` and dispatches to the right method on `DraftOrderService`.
 *
 * `draft-create` and `draft-update` carry the local draft ID — the
 * processor loads the row + line items fresh, so the job stays small
 * even if the draft has many items. `draft-delete` carries the Shopify
 * externalId because by the time the job runs, the local row is already
 * soft-deleted (we don't want to gate the local delete on Shopify
 * availability).
 */
export type DraftMirrorJobData =
  | {
      type: 'draft-create';
      draftId: string;
      organizationId: string;
    }
  | {
      type: 'draft-update';
      draftId: string;
      organizationId: string;
    }
  | {
      type: 'draft-delete';
      /** Shopify DraftOrder GID numeric suffix (e.g. "1234567890"). */
      externalId: string;
      organizationId: string;
    }
  | {
      /**
       * Channels-page "Sync Now" trigger. The processor fans this out into
       * one `draft-create` job per unsynced draft on the org. Keeps the
       * channel sync path free of any direct DraftOrderService dependency
       * (otherwise the channel ↔ draft-order modules would cycle).
       */
      type: 'bulk-mirror';
      organizationId: string;
    };
