import { IsOptional, IsString } from 'class-validator';

export class QueryDraftStatsDto {
  // Scopes every aggregate to one sales channel. The month-to-date figures are
  // always the current month, so there is no period parameter here.
  @IsOptional() @IsString() channelId?: string;
}
