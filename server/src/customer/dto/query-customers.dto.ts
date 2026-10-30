import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { VipLevel } from '@prisma/client';

export class QueryCustomersDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
    @IsOptional() @IsEnum(VipLevel) vipLevel?: VipLevel;
    @IsOptional() @IsString() channelId?: string;
    @IsOptional() @IsString() search?: string;
    @IsOptional() @IsString() tag?: string;
    @IsOptional() @IsString() segment?: string;
    // Whitelisted: spread straight into Prisma `orderBy`, where an unknown
    // column is a 500, not a 400. See query-invoices.dto.ts.
    @IsOptional()
    @IsIn(['createdAt', 'firstName', 'lastName', 'ordersCount', 'totalSpent', 'vipLevel'])
    sortBy?: string = 'createdAt';
    @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc' = 'desc';
}