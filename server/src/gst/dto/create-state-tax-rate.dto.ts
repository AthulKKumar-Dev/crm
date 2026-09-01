import { IsNumber, IsString, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { IsGstRateSlab } from '../validators/is-gst-rate-slab.validator';

export class CreateStateTaxRateDto {
  @IsString()
  @Length(2, 2, { message: 'State code must be exactly 2 digits' })
  stateCode: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsGstRateSlab()
  gstRate: number;
}
