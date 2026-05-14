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
    };
