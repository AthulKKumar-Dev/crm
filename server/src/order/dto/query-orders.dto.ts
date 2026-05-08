import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderFinancialStatus, OrderFulfillmentStatus } from '@prisma/client';

export class QueryOrdersDto {
    // Pagination
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;

    // Filters
    @IsOptional() @IsEnum(OrderFinancialStatus) financialStatus?: OrderFinancialStatus;
    @IsOptional() @IsEnum(OrderFulfillmentStatus) fulfillmentStatus?: OrderFulfillmentStatus;
    @IsOptional() @IsString() channelId?: string;

    // Filter to orders that contain a line item from the given product
    // (used by the product detail page to show "Recent sales").
    @IsOptional() @IsString() productId?: string;
    @IsOptional() @IsString() customerId?: string;

    // Search (by order number, customer name, or customer email)
    @IsOptional() @IsString() search?: string;

    // Sort
    @IsOptional() @IsString() sortBy?: string = 'externalCreatedAt';
    @IsOptional() @IsString() sortOrder?: 'asc' | 'desc' = 'desc';

    // Date range
    @IsOptional() @IsString() dateFrom?: string;
    @IsOptional() @IsString() dateTo?: string;
}