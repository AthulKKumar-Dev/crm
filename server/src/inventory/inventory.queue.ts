export const INVENTORY_QUEUE = 'inventory';

/**
 * Inventory background jobs. Phase A: only the enable-seed. The job is
 * idempotent end-to-end (StockLevel creates skip existing rows; ledger rows
 * carry idempotency keys), so BullMQ retries are safe.
 */
export type InventoryJobData = {
  type: 'enable-seed';
  organizationId: string;
  /** User who triggered the enable — stamped as the ledger actor. */
  userId?: string;
};
