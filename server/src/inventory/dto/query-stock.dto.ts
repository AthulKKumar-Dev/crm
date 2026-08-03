import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class QueryStockDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  // Matches variant SKU, barcode, or product/variant title.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  // low = 0 < available <= org.lowStockThreshold; out = available <= 0;
  // oversold = available < 0 (the Shopify-mirror negative case).
  @IsOptional()
  @IsIn(['low', 'out', 'oversold'])
  stockFilter?: string;

  @IsOptional()
  @IsIn(['available', 'onHand', 'updatedAt', 'sku'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class QueryLedgerDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  reason?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
