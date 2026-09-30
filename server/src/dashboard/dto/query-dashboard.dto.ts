import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
    zonedDayStartDaysAgo,
    zonedMonthStartMonthsAgo,
} from '../../common/utils/zoned-date.util';

/// Mirrors ANALYTICS_RANGES so the two dashboards offer the same windows.
export const DASHBOARD_RANGES = ['7d', '30d', '6m', '12m'] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export interface RangeWindow {
    /// Bucket size for the chart. 30 days bucketed by month would draw one bar.
    unit: 'day' | 'month';
    /// Whole units BEFORE the current one. The window starts that many units
    /// back and runs through the current, in-progress unit.
    span: number;
    label: string;
}

/// Single source of truth for how a range maps to a window and a bucket size.
///
/// Day ranges are N FULL days plus today — "Last 7 days" on 30 Sep starts at
/// 00:00 on 23 Sep — so the dashboard and the Orders page stats (which sends
/// today − 7 as its `dateFrom`) cover the same orders and read the same. Month
/// ranges keep their bar count: "Last 6 months" is this month plus the 5 before.
export function rangeToWindow(range: DashboardRange | undefined): RangeWindow {
    switch (range ?? '12m') {
        case '7d': return { unit: 'day', span: 7, label: 'Last 7 days' };
        case '30d': return { unit: 'day', span: 30, label: 'Last 30 days' };
        case '6m': return { unit: 'month', span: 5, label: 'Last 6 months' };
        case '12m': return { unit: 'month', span: 11, label: 'Last 12 months' };
    }
}

/**
 * Start of the window, snapped to a bucket boundary IN `timeZone`.
 *
 * Snapping matters: a "last 12 months" window measured as `now − 365 days`
 * starts mid-month, so the first bar covers a part-month and reads as a slump
 * that never happened. The zone matters too: snapping to UTC midnight started
 * every IST window at 05:30, dropping the first morning's orders.
 */
export function windowStart(
    now: Date,
    { unit, span }: RangeWindow,
    timeZone: string,
): Date {
    return unit === 'month'
        ? zonedMonthStartMonthsAgo(now, span, timeZone)
        : zonedDayStartDaysAgo(now, span, timeZone);
}

export class QueryDashboardDto {
    /// Pre-canned window matching the UI selector. Defaults to `12m`.
    @IsOptional() @IsEnum(DASHBOARD_RANGES) range?: DashboardRange;

    @IsOptional() @IsString() dateFrom?: string;  // e.g., "2026-01-01"
    @IsOptional() @IsString() dateTo?: string;    // e.g., "2026-12-31"
    @IsOptional() @IsString() channelId?: string; // filter by specific channel
}
