import { IsNumber, IsString, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductTypeTaxRateDto {
  @IsString()
  @MinLength(1, { message: 'Product type is required' })
  productType: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(28)
  gstRate: number;
}
