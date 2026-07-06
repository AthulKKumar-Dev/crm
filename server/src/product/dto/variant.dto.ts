import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO31661Alpha2,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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
