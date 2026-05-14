import { IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TrackingInfoDto } from './create-fulfillment.dto';

/**
 * Update tracking number/URL/carrier on an existing fulfillment.
 * `notifyCustomer` is Shopify-only — sends a tracking-updated email.
 */
export class UpdateTrackingDto {
  @ValidateNested()
  @Type(() => TrackingInfoDto)
  tracking: TrackingInfoDto;

  @IsOptional() @IsBoolean() notifyCustomer?: boolean = true;
}
