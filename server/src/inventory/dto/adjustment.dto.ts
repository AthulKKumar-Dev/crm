import { StockBucket } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  NotEquals,
} from 'class-validator';

/**
 * Manual stock adjustment for one variant × warehouse × bucket. Exactly one of
 * `delta` (signed change) or `setTo` (absolute target) must be provided —
 * validated in the service (class-validator can't express XOR cleanly).
 */
export class CreateAdjustmentDto {
  @IsString()
  variantId: string;

  // Defaults to the org's default warehouse when omitted.
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsEnum(StockBucket)
  bucket: StockBucket;

  @IsOptional()
  @IsInt()
  @NotEquals(0)
  delta?: number;

  @IsOptional()
  @IsInt()
  setTo?: number;

  // Why the stock moved — drives ledger reporting. 'adjustment' when omitted.
  @IsOptional()
  @IsIn(['adjustment', 'count', 'damage', 'found', 'correction'])
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
