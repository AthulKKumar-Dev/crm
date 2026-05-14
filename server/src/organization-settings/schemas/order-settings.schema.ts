import { z } from 'zod';

/**
 * Per-org order settings. Stored as `OrganizationSettings.orderSettings`
 * (JSONB) and validated by this schema before any write. Adding a new field
 * here doesn't require a Prisma migration.
 */
export const OrderSettingsSchema = z.object({
  /**
   * When TRUE, offline orders created in the CRM are automatically pushed to
   * the connected Shopify channel. When FALSE (default), offline orders stay
   * local until pushed manually or via the channels-page bulk Sync.
   */
  autoSyncToShopify: z.boolean().default(false),
});

export type OrderSettings = z.infer<typeof OrderSettingsSchema>;

/** Patch schema — all fields optional for PATCH semantics. */
export const UpdateOrderSettingsSchema = OrderSettingsSchema.partial();
export type UpdateOrderSettingsInput = z.infer<typeof UpdateOrderSettingsSchema>;

/** Apply schema defaults to an unknown value, or fall through to defaults. */
export function parseOrderSettings(value: unknown): OrderSettings {
  const result = OrderSettingsSchema.safeParse(value ?? {});
  return result.success ? result.data : OrderSettingsSchema.parse({});
}
