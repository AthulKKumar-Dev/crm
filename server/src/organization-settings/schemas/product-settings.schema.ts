import { z } from 'zod';

/**
 * Per-org product settings. Stored as `OrganizationSettings.productSettings`
 * (JSONB) and validated by this schema before any write. Adding a new field
 * here doesn't require a Prisma migration.
 */
export const ProductSettingsSchema = z.object({
  /**
   * When TRUE, products created in the CRM are automatically pushed to the
   * connected Shopify channel. When FALSE (default), products stay local and
   * must be pushed manually (per-item Sync button) or in bulk (channels-page
   * Sync action).
   */
  autoSyncToShopify: z.boolean().default(false),
});

export type ProductSettings = z.infer<typeof ProductSettingsSchema>;

/** Patch schema — all fields optional for PATCH semantics. */
export const UpdateProductSettingsSchema = ProductSettingsSchema.partial();
export type UpdateProductSettingsInput = z.infer<typeof UpdateProductSettingsSchema>;

/** Apply schema defaults to an unknown value, or fall through to defaults. */
export function parseProductSettings(value: unknown): ProductSettings {
  const result = ProductSettingsSchema.safeParse(value ?? {});
  return result.success ? result.data : ProductSettingsSchema.parse({});
}
