import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ShopifyAnalyticsService } from '../channel/shopify-analytics.service';

/**
 * Daily analytics refresh. Runs once at 03:00 server time and pulls the last
 * 35 days of ShopifyQL data for every connected Shopify channel — a small
 * trailing window so prior days that arrive late (Shopify backfills their
 * analytics dataset on a delay) get updated too.
 *
 * `ScheduleModule.forRoot()` is already registered globally in
 * `app.module.ts`, so adding this provider is enough to enrol the cron.
 */
@Injectable()
export class AnalyticsScheduler {
  private readonly logger = new Logger(AnalyticsScheduler.name);

  constructor(private readonly shopifyAnalytics: ShopifyAnalyticsService) {}

  @Cron('0 3 * * *')
  async refreshAll(): Promise<void> {
    this.logger.log('Running daily analytics refresh');
    try {
      await this.shopifyAnalytics.refreshAll(35);
      this.logger.log('Daily analytics refresh complete');
    } catch (err) {
      this.logger.error(
        'Daily analytics refresh failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
