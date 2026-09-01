import { IsNumber, IsString, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { IsGstRateSlab } from '../validators/is-gst-rate-slab.validator';

export class CreateProductTypeTaxRateDto {
  @IsString()
  @MinLength(1, { message: 'Product type is required' })
  productType: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsGstRateSlab()
  gstRate: number;
}
