import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Capture an authorized payment.
 *
 * For SHOPIFY orders, the service looks up the order's authorize transaction
 * and calls orderCapture against it.
 *
 * For MANUAL orders this is a degenerate no-op — there's no payment processor
 * involved — so the service simply flips financialStatus to PAID and records
 * a timeline event. Pass `amount` to override the captured amount; omitting it
 * captures the full outstanding balance.
 */
export class CapturePaymentDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  amount?: number;

  @IsOptional() @IsString()
  currency?: string;

  /** True = close the auth (cannot capture further). Default false. */
  @IsOptional() @IsBoolean()
  finalCapture?: boolean = false;
}
