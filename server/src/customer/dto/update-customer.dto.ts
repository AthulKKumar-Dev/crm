import { IsArray, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
// The single source of truth for GSTIN shape — this file inlined a copy,
// so a correction to one would silently not reach the other.
import { GSTIN_REGEX } from '../../gst/constants/gst-rates';
import { VipLevel } from '@prisma/client';

export class UpdateCustomerDto {
    @IsOptional() @IsEnum(VipLevel) vipLevel?: VipLevel;
    @IsOptional() @IsString() internalNotes?: string;
    @IsOptional() @IsArray() @IsString({ each: true }) segments?: string[];
    @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];

    // GST fields — customer's GSTIN for B2B invoicing
    @IsOptional()
    @IsString()
    @Matches(GSTIN_REGEX, {
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