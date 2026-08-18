export const SYNC_QUEUE = 'shopify-sync';

export interface SyncJobData {
    channelId: string;
    organizationId: string;
    entityTypes: string[];   // ["locations", "products", "orders", "customers", "inventory"]
}