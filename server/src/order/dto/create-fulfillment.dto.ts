import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * One line item to include in a fulfillment. Quantity defaults to "all
 * remaining" if omitted (validated against fulfillable quantity server-side).
 */
export class FulfillmentLineItemDto {
  /**
   * For Shopify orders: the `OrderLineItem` global ID (numeric suffix). The
   * server cross-references each line item against the order's open
   * fulfillment orders to find the right Shopify `FulfillmentOrder`.
   *
   * For manual orders: the local `OrderLineItem.id` (cuid).
   */
  @IsString() lineItemId: string;

  @IsOptional() @IsInt() @Min(1) quantity?: number;
}

export class TrackingInfoDto {
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsString() company?: string;
}

export class CreateFulfillmentDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one line item must be fulfilled' })
  @ValidateNested({ each: true })
  @Type(() => FulfillmentLineItemDto)
  lineItems: FulfillmentLineItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TrackingInfoDto)
  tracking?: TrackingInfoDto;

  /** Shopify only — sends shipping confirmation email when true. */
  @IsOptional() @IsBoolean() notifyCustomer?: boolean = true;
}
