import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DraftOrderStatus } from '@prisma/client';

export class QueryDraftOrdersDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;

  @IsOptional() @IsEnum(DraftOrderStatus) status?: DraftOrderStatus;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() channelId?: string;
  @IsOptional() @IsString() search?: string;

  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;

  // Whitelisted: spread straight into Prisma `orderBy`, where an unknown
  // column is a 500, not a 400. See query-invoices.dto.ts.
  @IsOptional() @IsIn(['updatedAt', 'createdAt', 'totalPrice', 'name']) sortBy?: string = 'updatedAt';
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc' = 'desc';
}
