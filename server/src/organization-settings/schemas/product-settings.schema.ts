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

  /**
   * Global override for the per-variant "Continue selling when out of stock"
   * flag. When TRUE, every variant in the org is treated as continue-selling
   * regardless of its individual setting — useful for businesses that fulfill
   * backorders by default. When FALSE (default), the per-variant flag is
   * honored as-is.
   *
   * Affects two places:
   *   1. Offline-order stock validation in OrderService — refuses lines only
   *      when neither the global nor the variant flag is on AND stock < qty.
   *   2. Shopify push payloads — `inventory_policy` is sent as `continue`
   *      whenever (global || variant) is true, so the merchant's Shopify
   *      storefront behaves consistently with the CRM.
   */
  allowOversellGlobally: z.boolean().default(false),

  /**
   * Global override for the per-variant "Track quantity" flag. When TRUE,
   * every variant in the org is treated as tracked regardless of its
   * individual setting. This pairs with `allowOversellGlobally` for
   * businesses that always want stock movements recorded — even on variants
   * a user may have set to "untracked" by accident.
   *
   * Affects:
   *   1. Offline-order stock checks and inventory decrement (force tracked).
   *   2. Shopify push payloads — `inventory_management: 'shopify'` is sent
   *      for every variant when global is ON.
   */
  trackQuantityGlobally: z.boolean().default(false),

  /**
   * Multi-vendor routing. When enabled, product sync reads the Shopify product
   * metafield `{vendorMetafieldNamespace}.{vendorMetafieldKey}` into
   * `Product.vendorKey`, which becomes the primary key for matching a product to
   * a vendor (the built-in `Product.vendor` name is the fallback).
   */
  vendorMetafieldEnabled: z.boolean().default(false),
  vendorMetafieldNamespace: z.string().default("custom"),
  vendorMetafieldKey: z.string().default("vendor_shop_domain"),
});

export type ProductSettings = z.infer<typeof ProductSettingsSchema>;

/**
 * Patch schema — every field truly optional.
 *
 * We can't use `ProductSettingsSchema.partial()` here: Zod's `.partial()`
 * keeps the `.default(false)` on each field, which means a PATCH body like
 * `{ allowOversellGlobally: true }` gets canonicalized to
 * `{ autoSyncToShopify: false, allowOversellGlobally: true }` by the
 * validation pipe — and the service's `{ ...current, ...body }` merge then
 * overwrites the user's existing autoSyncToShopify=true with false. Building
 * the patch schema from scratch with plain `.optional()` (no defaults)
 * preserves missing-key semantics so the merge is a real per-field patch.
 */
export const UpdateProductSettingsSchema = z.object({
  autoSyncToShopify: z.boolean().optional(),
  allowOversellGlobally: z.boolean().optional(),
  trackQuantityGlobally: z.boolean().optional(),
  vendorMetafieldEnabled: z.boolean().optional(),
  vendorMetafieldNamespace: z.string().optional(),
  vendorMetafieldKey: z.string().optional(),
});
export type UpdateProductSettingsInput = z.infer<typeof UpdateProductSettingsSchema>;

/** Apply schema defaults to an unknown value, or fall through to defaults. */
export function parseProductSettings(value: unknown): ProductSettings {
  const result = ProductSettingsSchema.safeParse(value ?? {});
  return result.success ? result.data : ProductSettingsSchema.parse({});
}
