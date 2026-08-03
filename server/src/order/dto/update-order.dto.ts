import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Editable fields on an existing order. Status/totals are deliberately NOT
 * editable here — those flow through dedicated endpoints (cancel, markPaid,
 * capture, refund).
 *
 * `email`, `phone`, `poNumber` and `customAttributes` were removed. They were
 * forwarded to Shopify but never stored locally — the `orders` table has no
 * columns for them — so for a MANUAL order (which makes no Shopify call at
 * all) editing an email was a complete no-op that still wrote an "Order
 * details updated (email, phone)" timeline entry. Nothing in the UI ever sent
 * them either.
 *
 * With the global pipe's `forbidNonWhitelisted: true`, dropping them turns that
 * silent no-op into an explicit 400 naming the field. Re-adding an order-level
 * contact later should mean real columns plus a UI to set them, not just a
 * revived DTO field.
 */
export class UpdateOrderDto {
  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsString()
  note?: string;

  @IsOptional() @IsObject()
  shippingAddress?: Record<string, unknown>;

  /**
   * MANUAL orders only. Shopify's `OrderInput` has no `billingAddress` field
   * (it exists on `OrderCreateInput` only), so a Shopify-sourced order cannot
   * accept this — see the guard in `OrderService.update()`.
   */
  @IsOptional() @IsObject()
  billingAddress?: Record<string, unknown>;
}
