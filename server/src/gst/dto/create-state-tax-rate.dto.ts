import { IsNumber, IsString, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStateTaxRateDto {
  @IsString()
  @Length(2, 2, { message: 'State code must be exactly 2 digits' })
  stateCode: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(28)
  gstRate: number;
}
