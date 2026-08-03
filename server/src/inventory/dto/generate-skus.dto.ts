import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Bulk SKU/barcode generation. Either an explicit variant list or a filter —
 * when both are present the filter narrows the list; when neither is present
 * the filter defaults to every variant missing the target field.
 */
export class GenerateCodesDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(2000)
  variantIds?: string[];

  @IsOptional()
  @IsIn(['missing-sku', 'missing-barcode', 'all'])
  filter?: string;

  // Never true by default: overwriting a real EAN/UPC that came from Shopify
  // would break retail scanning. Explicit opt-in only.
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}
