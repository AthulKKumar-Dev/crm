import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO31661Alpha2,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GstSupplyType } from '@prisma/client';
import { IsGstRateSlab } from '../../gst/validators/is-gst-rate-slab.validator';
import { IsUqc } from '../../gst/validators/is-uqc.validator';

export const WEIGHT_UNITS = ['g', 'kg', 'oz', 'lb'] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export class CreateVariantDto {
  // ── Pricing ──────────────────────────────────────────────────────────────
  // Optional (Shopify parity): when omitted on POST :id/variants the variant
  // inherits the product's base price; on product create it defaults to 0.
  // An explicit value — including 0 — always wins.
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  // ── Identifiers ──────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  // ── Inventory ────────────────────────────────────────────────────────────
  @IsOptional()
  @IsInt()
  @Min(0)
  inventoryQuantity?: number;

  @IsOptional()
  @IsBoolean()
  trackQuantity?: boolean;

  @IsOptional()
  @IsBoolean()
  continueSellingWhenOutOfStock?: boolean;

  // ── Shipping ─────────────────────────────────────────────────────────────
  @IsOptional()
  @IsBoolean()
  requiresShipping?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsString()
  @IsIn(WEIGHT_UNITS as readonly string[])
  weightUnit?: WeightUnit;

  // ── Customs ──────────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  hsCode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  @IsISO31661Alpha2()
  countryOfOrigin?: string;

  // ── Tax ──────────────────────────────────────────────────────────────────
  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  // ── GST override (null = inherit from the product) ───────────────────────
  // The product's Tax (GST) fields are the default for every variant; these
  // exist for the one variant classified differently. Vendors cannot set them.
  @IsOptional()
  @IsString()
  @MaxLength(10)
  hsnCode?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsGstRateSlab()
  gstRate?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  @IsUqc()
  unitOfMeasure?: string | null;

  @IsOptional()
  @IsEnum(GstSupplyType)
  supplyType?: GstSupplyType | null;

  // ── Options + structure ──────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  option1?: string;

  @IsOptional()
  @IsString()
  option2?: string;

  @IsOptional()
  @IsString()
  option3?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;

  @IsOptional()
  @IsString()
  imageId?: string;
}

export class UpdateVariantDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  inventoryQuantity?: number;

  @IsOptional()
  @IsBoolean()
  trackQuantity?: boolean;

  @IsOptional()
  @IsBoolean()
  continueSellingWhenOutOfStock?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresShipping?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsString()
  @IsIn(WEIGHT_UNITS as readonly string[])
  weightUnit?: WeightUnit;

  @IsOptional()
  @IsString()
  hsCode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  @IsISO31661Alpha2()
  countryOfOrigin?: string;

  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  // GST override, mirrored from CreateVariantDto. Null clears (= inherit).
  @IsOptional()
  @IsString()
  @MaxLength(10)
  hsnCode?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsGstRateSlab()
  gstRate?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  @IsUqc()
  unitOfMeasure?: string | null;

  @IsOptional()
  @IsEnum(GstSupplyType)
  supplyType?: GstSupplyType | null;

  @IsOptional()
  @IsString()
  option1?: string;

  @IsOptional()
  @IsString()
  option2?: string;

  @IsOptional()
  @IsString()
  option3?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;
}

export class ReorderVariantsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  variantIds: string[];
}

export class BulkVariantUpdateItemDto extends UpdateVariantDto {
  @IsString()
  @IsNotEmpty()
  variantId: string;
}

export class BulkUpdateVariantsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BulkVariantUpdateItemDto)
  updates: BulkVariantUpdateItemDto[];
}
