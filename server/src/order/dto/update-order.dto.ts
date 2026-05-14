import {
  IsArray,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Editable fields on an existing order. Mirrors the subset of Shopify's
 * OrderInput we want to support; for offline (MANUAL) orders the same fields
 * apply but stay local. Status/totals are deliberately NOT editable here —
 * those flow through dedicated endpoints (cancel, markPaid, capture, refund).
 */
export class CustomAttributeDto {
  @IsString() key: string;

  @IsString() value: string;
}

export class UpdateOrderDto {
  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsString()
  note?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsString()
  poNumber?: string;

  @IsOptional() @IsObject()
  shippingAddress?: Record<string, unknown>;

  @IsOptional() @IsObject()
  billingAddress?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomAttributeDto)
  customAttributes?: CustomAttributeDto[];
}
