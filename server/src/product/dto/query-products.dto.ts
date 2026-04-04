import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from '@prisma/client';

export class QueryProductsDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;

    @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
    @IsOptional() @IsString() vendor?: string;
    @IsOptional() @IsString() productType?: string;
    @IsOptional() @IsString() channelId?: string;
    @IsOptional() @IsString() search?: string;
    @IsOptional() @IsString() sortBy?: string = 'createdAt';
    @IsOptional() @IsString() sortOrder?: 'asc' | 'desc' = 'desc';

    // Inventory filters
    @IsOptional() @IsString() stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
}