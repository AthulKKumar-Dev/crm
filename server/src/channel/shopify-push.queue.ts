export const SHOPIFY_PUSH_QUEUE = 'shopify-push';

/**
 * Discriminated union of every kind of push job. The processor switches on
 * `type` and dispatches to the right service method.
 */
export type ShopifyPushJobData =
  | {
      type: 'order';
      orderId: string;
      organizationId: string;
    }
  | {
      type: 'product';
      productId: string;
      organizationId: string;
    }
  | {
      type: 'bulk-products';
      organizationId: string;
    }
  | {
      type: 'bulk-orders';
      organizationId: string;
    }
  | {
      /**
       * Absolute `available` push for specific variants after a CRM-origin
       * stock operation (adjustment, enable-seed, receipt, return restock).
       * Enqueued by InventoryModule directly on this queue — deliberately NOT
       * via ShopifyPushEnqueuer, to keep InventoryModule free of a
       * ChannelModule import (ChannelModule imports InventoryModule for the
       * ledger; the queue name is the cycle-free seam between them).
       */
      type: 'push-availability';
      organizationId: string;
      variantIds: string[];
    }
  | {
      /**
       * Mirror the store's Shopify locations as warehouses, then reconcile
       * per-location stock into them. Enqueued by InventoryModule at the end
       * of the warehousing enable flow, for the same reason as
       * `push-availability` above: the queue name is the cycle-free seam, so
       * the inventory side can reach ChannelModule without importing it.
       *
       * Named for its effect, not its direction — this one pulls. It rides
       * this queue because the seam is what matters, not the verb.
       */
      type: 'sync-locations';
      organizationId: string;
    };
