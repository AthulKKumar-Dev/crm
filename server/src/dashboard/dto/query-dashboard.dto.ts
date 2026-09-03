import { IsEnum, IsOptional, IsString } from 'class-validator';

/// Mirrors ANALYTICS_RANGES so the two dashboards offer the same windows.
export const DASHBOARD_RANGES = ['30d', '6m', '12m'] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export interface RangeWindow {
    /// Bucket size for the chart. 30 days bucketed by month would draw one bar.
    unit: 'day' | 'month';
    /// How many buckets the chart shows — the window is exactly this many.
    buckets: number;
    label: string;
}

/// Single source of truth for how a range maps to a window and a bucket size.
export function rangeToWindow(range: DashboardRange | undefined): RangeWindow {
    switch (range ?? '12m') {
        case '30d': return { unit: 'day', buckets: 30, label: 'Last 30 days' };
        case '6m': return { unit: 'month', buckets: 6, label: 'Last 6 months' };
        case '12m': return { unit: 'month', buckets: 12, label: 'Last 12 months' };
    }
}

/**
 * Start of the window, snapped to a bucket boundary.
 *
 * Snapping matters: a "last 12 months" window measured as `now − 365 days`
 * starts mid-month, so the first bar covers a part-month and reads as a slump
 * that never happened — and the series then runs to a thirteenth bucket.
 * Anchoring to bucket starts gives exactly `buckets` bars, the last being the
 * current period in progress.
 */
export function windowStart(now: Date, { unit, buckets }: RangeWindow): Date {
    if (unit === 'month') {
        return new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (buckets - 1), 1),
        );
    }
    const startOfDay = Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    );
    return new Date(startOfDay - (buckets - 1) * 24 * 60 * 60 * 1000);
}

export class QueryDashboardDto {
    /// Pre-canned window matching the UI selector. Defaults to `12m`.
    @IsOptional() @IsEnum(DASHBOARD_RANGES) range?: DashboardRange;

    @IsOptional() @IsString() dateFrom?: string;  // e.g., "2026-01-01"
    @IsOptional() @IsString() dateTo?: string;    // e.g., "2026-12-31"
    @IsOptional() @IsString() channelId?: string; // filter by specific channel
}
