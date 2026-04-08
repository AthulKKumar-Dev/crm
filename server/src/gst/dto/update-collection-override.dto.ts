import { IsNumber, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCollectionOverrideDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(28)
  gstRate: number;
}
