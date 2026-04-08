import { PartialType } from '@nestjs/mapped-types';
import { CreateGstinDto } from './create-gstin.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateGstinDto extends PartialType(CreateGstinDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
