import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { VipLevel } from '@prisma/client';

export class UpdateCustomerDto {
    @IsOptional() @IsEnum(VipLevel) vipLevel?: VipLevel;
    @IsOptional() @IsString() internalNotes?: string;
    @IsOptional() @IsArray() @IsString({ each: true }) segments?: string[];
    @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}