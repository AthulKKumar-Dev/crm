import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderCancelReason } from '@prisma/client';

/**
 * Cancel an order — works for both SHOPIFY (calls orderCancel mutation; the
 * action is async on Shopify's side and the orders/cancelled webhook
 * reconciles the local row) and MANUAL (purely local cancel).
 *
 * Note: Shopify's GraphQL OrderCancelReason includes STAFF, which the local
 * enum doesn't have yet. Until we extend the enum (deferred), STAFF maps to
 * OTHER locally; the original reason is preserved in the timeline event.
 */
export class CancelOrderDto {
  @IsEnum(OrderCancelReason)
  reason: OrderCancelReason;

  /** Issue a refund as part of cancellation. */
  @IsOptional() @IsBoolean()
  refund?: boolean = false;

  /** Restock items back to inventory. */
  @IsOptional() @IsBoolean()
  restock?: boolean = true;

  /** Send a cancellation email to the customer (Shopify only). */
  @IsOptional() @IsBoolean()
  notifyCustomer?: boolean = true;

  /** Internal note shown to staff in Shopify's order timeline. */
  @IsOptional() @IsString()
  staffNote?: string;
}
