import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { GSTIN_REGEX } from '../constants/gst-rates';

export class CreateGstinDto {
  @IsString()
  @Matches(GSTIN_REGEX, {
    message:
      'GSTIN must be a valid 15-character GST Identification Number (e.g. 27AABCU9603R1ZM)',
  })
  gstin: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  legalName: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradeName?: string;

  @IsString()
  @Length(2, 2, { message: 'State code must be exactly 2 digits' })
  stateCode: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  stateName: string;

  @IsOptional()
  @IsObject()
  address?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
