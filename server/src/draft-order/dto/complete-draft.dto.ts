import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Convert a draft into a finalized Order.
 *
 * MANUAL: `paymentMethod` is required (mirrors offline-order semantics).
 * SHOPIFY: `paymentPending` controls whether Shopify marks the order as paid
 *   on creation. When true, the order is created as PENDING and the customer
 *   is expected to pay later (matches Shopify's draftOrderComplete arg).
 */
export class CompleteDraftDto {
  /** MANUAL only. */
  @IsOptional()
  @IsIn(['CASH', 'CARD', 'UPI', 'OTHER'])
  paymentMethod?: 'CASH' | 'CARD' | 'UPI' | 'OTHER';

  /** SHOPIFY only. Defaults to false (Shopify marks the order PAID). */
  @IsOptional() @IsBoolean() paymentPending?: boolean;

  /** Optional: generate a GST invoice during completion (MANUAL only). */
  @IsOptional() @IsBoolean() generateInvoice?: boolean;

  @IsOptional() @IsString() sellerGstinId?: string;
}
