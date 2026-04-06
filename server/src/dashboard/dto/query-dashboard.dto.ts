import { IsOptional, IsString } from 'class-validator';

export class QueryDashboardDto {
    @IsOptional() @IsString() dateFrom?: string;  // e.g., "2026-01-01"
    @IsOptional() @IsString() dateTo?: string;    // e.g., "2026-12-31"
    @IsOptional() @IsString() channelId?: string; // filter by specific channel
}