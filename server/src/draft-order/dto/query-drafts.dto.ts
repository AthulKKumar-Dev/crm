import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
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

  @IsOptional() @IsString() sortBy?: string = 'updatedAt';
  @IsOptional() @IsString() sortOrder?: 'asc' | 'desc' = 'desc';
}
