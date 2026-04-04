export const SYNC_QUEUE = 'shopify-sync';

export interface SyncJobData {
    channelId: string;
    organizationId: string;
    entityTypes: string[];   // ["products", "orders", "customers", "inventory"]
}