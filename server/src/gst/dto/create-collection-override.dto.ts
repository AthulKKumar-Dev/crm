import { IsNumber, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { IsGstRateSlab } from '../validators/is-gst-rate-slab.validator';

export class CreateCollectionOverrideDto {
  @IsString()
  collectionId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsGstRateSlab()
  gstRate: number;
}
