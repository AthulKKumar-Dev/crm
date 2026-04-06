import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
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
    @IsOptional() @IsString() sortBy?: string = 'createdAt';
    @IsOptional() @IsString() sortOrder?: 'asc' | 'desc' = 'desc';
}