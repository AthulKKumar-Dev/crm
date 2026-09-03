import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GstSupplyType, ProductStatus } from '@prisma/client';
import { CreateVariantDto } from './variant.dto';
import { ProductOptionDto } from './option.dto';

export { CreateVariantDto } from './variant.dto';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Product title is required' })
  title: string;

  @IsOptional()
  @IsString()
  vendor?: string;

  @IsOptional()
  @IsString()
  productType?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];

  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  hsnCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(28)
  gstRate?: number;

  /**
   * GST unit quantity code (UQC) for GSTR-1 table 12 — "NOS", "KGS", "PCS"…
   * Distinct from a variant's weightUnit. Server-side fallback is "NOS".
   */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  unitOfMeasure?: string;

  @IsOptional()
  @IsEnum(GstSupplyType)
  supplyType?: GstSupplyType;

  /**
   * Optional ISO 8601 date for scheduled publishing. When the product status
   * is DRAFT and this date is in the future, ProductPublishScheduler flips
   * the product to ACTIVE on/after the date.
   */
  @IsOptional()
  @IsDateString()
  publishedAt?: string | null;

  // ── Variant inputs (mutually exclusive) ─────────────────────────────────
  // - `variant`  (singular): legacy single-default-variant flow.
  // - `variants` (plural):   multi-variant flow with per-variant SKU/price/stock
  //                          and option assignments. Requires `options`.
  // Exactly one must be provided. Validated in the service layer.
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateVariantDto)
  variant?: CreateVariantDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ProductOptionDto)
  options?: ProductOptionDto[];
}
