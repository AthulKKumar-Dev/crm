import { z } from 'zod';

/**
 * Per-org inventory settings. Stored as `OrganizationSettings.inventorySettings`
 * (JSONB) and validated by this schema before any write. Adding a new field
 * here doesn't require a Prisma migration.
 */
export const InventorySettingsSchema = z.object({
  /**
   * Master switch for Inventory V1 warehousing (StockLevel buckets,
   * warehouses, receiving, pick/pack). NOT settable via the settings PATCH —
   * it flips only at the END of the `POST /inventory/enable` seed job so there
   * is never a window where both the legacy single-quantity path and the
   * bucket path write for the same org. Plan-gated to GROWTH/ADVANCE.
   */
  warehousingEnabled: z.boolean().default(false),

  /**
   * When TRUE, confirmed stock receipts land in the QC bucket and need an
   * explicit "Complete QC" step (accepted → AVAILABLE, rejected → DAMAGED).
   * When FALSE (default), receipts go straight to AVAILABLE.
   */
  qcOnReceiving: z.boolean().default(false),

  /**
   * When TRUE (default), the pick station requires a product barcode scan per
   * unit; manual +/- entry is hidden. Orgs without scanner hardware can turn
   * this off to use manual quantity entry.
   */
  requireScanToPick: z.boolean().default(true),

  /**
   * SKU generation prefix, e.g. "9TH". Empty string (default) derives a
   * 3-letter prefix from the organization slug at generation time.
   */
  skuPrefix: z.string().max(10).default(''),

  /**
   * Next value of the org-scoped SKU sequence. Claimed atomically (raw JSONB
   * increment) by the generation endpoint — never edit by hand.
   */
  skuSequence: z.number().int().min(1).default(1),

  /** When TRUE, a receipt line's unitCost updates the variant's cost field. */
  updateCostOnReceipt: z.boolean().default(false),
});

export type InventorySettings = z.infer<typeof InventorySettingsSchema>;

/**
 * Patch schema — every field truly optional, without defaults (same
 * `.partial()` trap as the other settings domains: defaults in a patch would
 * silently reset unsent fields during the service-side merge).
 *
 * `warehousingEnabled` and `skuSequence` are deliberately ABSENT: the flag
 * flips only via the enable flow, the sequence only via atomic claim.
 */
export const UpdateInventorySettingsSchema = z.object({
  qcOnReceiving: z.boolean().optional(),
  requireScanToPick: z.boolean().optional(),
  skuPrefix: z.string().max(10).optional(),
  updateCostOnReceipt: z.boolean().optional(),
});
export type UpdateInventorySettingsInput = z.infer<typeof UpdateInventorySettingsSchema>;

/** Apply schema defaults to an unknown value, or fall through to defaults. */
export function parseInventorySettings(value: unknown): InventorySettings {
  const result = InventorySettingsSchema.safeParse(value ?? {});
  return result.success ? result.data : InventorySettingsSchema.parse({});
}
