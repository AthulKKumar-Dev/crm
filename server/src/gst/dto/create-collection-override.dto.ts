import { IsNumber, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCollectionOverrideDto {
  @IsString()
  collectionId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(28)
  gstRate: number;
}
