import { IsArray, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { VipLevel } from '@prisma/client';

export class UpdateCustomerDto {
    @IsOptional() @IsEnum(VipLevel) vipLevel?: VipLevel;
    @IsOptional() @IsString() internalNotes?: string;
    @IsOptional() @IsArray() @IsString({ each: true }) segments?: string[];
    @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];

    // GST fields — customer's GSTIN for B2B invoicing
    @IsOptional()
    @IsString()
    @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, {
        message: 'GSTIN must be a valid 15-character GST Identification Number',
    })
    gstin?: string;

    @IsOptional()
    @IsString()
    @Length(2, 2, { message: 'Billing state code must be exactly 2 digits' })
    billingStateCode?: string;

    @IsOptional()
    @IsString()
    billingStateName?: string;
}