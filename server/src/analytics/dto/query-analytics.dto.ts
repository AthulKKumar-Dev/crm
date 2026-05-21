import { IsEnum, IsOptional, IsString } from 'class-validator';

export const ANALYTICS_RANGES = ['30d', '6m', '12m'] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/// Single source of truth for how an `AnalyticsRange` enum maps to a
/// trailing-day window. Used by both the GET (read snapshots) and POST
/// (refresh from Shopify) paths so the two always agree.
export function rangeToDays(range: AnalyticsRange | undefined): number {
  switch (range ?? '12m') {
    case '30d': return 30;
    case '6m':  return 182;
    case '12m': return 365;
  }
}

export class QueryAnalyticsDto {
  /// Pre-canned window matching the UI selector. Defaults to `12m`.
  @IsOptional()
  @IsEnum(ANALYTICS_RANGES)
  range?: AnalyticsRange;

  @IsOptional() @IsString() channelId?: string;
}
