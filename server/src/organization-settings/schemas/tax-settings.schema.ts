import { z } from 'zod';
import { DEFAULT_UQC, UQC_CODES } from '../../gst/constants/uqc';

/**
 * Per-org GST/tax settings. Stored as `OrganizationSettings.taxSettings`
 * (JSONB) and validated by this schema before any write. Adding a new field
 * here doesn't require a Prisma migration.
 *
 * Kept FLAT on purpose: `OrganizationSettingsService.updateTaxSettings` merges
 * with a shallow spread, so a nested object would be replaced wholesale rather
 * than deep-merged and a partial PATCH would silently drop sibling keys.
 */
export const TaxSettingsSchema = z.object({
  /**
   * Invoice value at or below which an inter-state B2C supply is reported in
   * GSTR-1 Table 7 (B2CS, summarised) rather than Table 5 (B2CL, invoice-wise).
   *
   * ₹1,00,000 is the statutory figure since November 2024, reduced from the
   * earlier ₹2,50,000. It is a setting rather than a constant because the
   * threshold has already moved once and a merchant's accountant may be filing
   * against the older limit for a prior period.
   *
   * Compared against invoice VALUE (grand total), not taxable value.
   */
  b2cLargeThreshold: z.number().positive().default(100000),

  /**
   * UQC used for GSTR-1 Table 12 rows when a product does not specify one.
   *
   * Table 12 requires a unit on every row and nothing in the catalogue carries
   * one today, so without a default every row would be invalid. NOS ("numbers")
   * fits anything sold by count.
   */
  defaultUnitOfMeasure: z.enum(UQC_CODES).default(DEFAULT_UQC),

  /**
   * Tax delivery charges as a COMPOSITE SUPPLY, at the principal supply's rate.
   *
   * Correct under Indian GST — delivery on a taxable supply normally takes the
   * goods' rate — and until now shipping was added to the grand total untaxed,
   * so every shipped order under-declared output tax.
   *
   * ⚠️ DEFAULT OFF, and this is the only setting in the module that changes tax
   * charged on a real transaction. For a Shopify order the customer was already
   * charged at checkout, so turning this on before the store's own shipping-tax
   * setting matches makes the invoice declare MORE than was collected. That
   * shows up correctly as a reconciliation mismatch, but it is a surprise worth
   * opting into rather than inheriting.
   */
  taxShipping: z.boolean().default(false),
});

export type TaxSettings = z.infer<typeof TaxSettingsSchema>;

/**
 * Patch schema — every field truly optional, without defaults.
 *
 * Same trap as OrderSettings and ProductSettings: `TaxSettingsSchema.partial()`
 * would KEEP the `.default(...)` on each field, so a PATCH that only sets
 * `defaultUnitOfMeasure` would be canonicalized to also carry
 * `b2cLargeThreshold: 100000` and silently reset a merchant's configured
 * threshold during the service-side merge. Explicit `.optional()` keeps unset
 * keys unset. `tax-settings.schema.spec.ts` guards this directly.
 */
export const UpdateTaxSettingsSchema = z.object({
  b2cLargeThreshold: z.number().positive().optional(),
  defaultUnitOfMeasure: z.enum(UQC_CODES).optional(),
  taxShipping: z.boolean().optional(),
});
export type UpdateTaxSettingsInput = z.infer<typeof UpdateTaxSettingsSchema>;

/**
 * Apply schema defaults to an unknown value, or fall through to defaults.
 *
 * `safeParse` rather than `parse`: this runs on the GST return hot path, and a
 * corrupt stored blob should degrade to defaults rather than throw and take the
 * whole return down with it.
 */
export function parseTaxSettings(value: unknown): TaxSettings {
  const result = TaxSettingsSchema.safeParse(value ?? {});
  return result.success ? result.data : TaxSettingsSchema.parse({});
}
