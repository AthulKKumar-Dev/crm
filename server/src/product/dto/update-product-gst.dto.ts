import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { IsGstRateSlab } from '../../gst/validators/is-gst-rate-slab.validator';

export class UpdateProductGstDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  hsnCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsGstRateSlab()
  gstRate?: number;
}
