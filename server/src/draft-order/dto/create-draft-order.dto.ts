import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GSTIN_REGEX } from '../../gst/constants/gst-rates';

/**
 * Customer input — same shape as the offline-order flow's customer block.
 * Either reference an existing customer by id, OR pass email/phone/name to
 * resolve-or-create. At least one identifier must be provided.
 */
export class DraftCustomerInputDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;

  @IsOptional()
  @IsString()
  @Matches(GSTIN_REGEX, {
    message: 'Customer GSTIN must be a valid 15-character GST Identification Number',
  })
  gstin?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2, { message: 'Billing state code must be exactly 2 digits' })
  billingStateCode?: string;

  @IsOptional() @IsObject() address?: Record<string, unknown>;
}

export class DraftLineItemDto {
  @IsString() productVariantId: string;

  @IsInt() @Min(1) quantity: number;

  @IsOptional() @IsNumber() @Min(0) unitPriceOverride?: number;

  @IsOptional() @IsNumber() @Min(0) discount?: number;
}

export class CreateDraftOrderDto {
  /**
   * Customer info is optional on drafts — merchants often start composing a
   * quote before deciding who it's for. Send `customer: {}` for a fully
   * anonymous draft, or fill any of the resolve-or-create fields.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => DraftCustomerInputDto)
  customer?: DraftCustomerInputDto;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one line item is required' })
  @ValidateNested({ each: true })
  @Type(() => DraftLineItemDto)
  lineItems: DraftLineItemDto[];

  @IsOptional() @IsString() note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsObject() shippingAddress?: Record<string, unknown>;
  @IsOptional() @IsObject() billingAddress?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  placeOfSupplyCode?: string;
}
