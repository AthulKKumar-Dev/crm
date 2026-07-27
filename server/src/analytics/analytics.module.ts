import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsDashboardService } from './analytics-dashboard.service';
import { AnalyticsScheduler } from './analytics.scheduler';
import { CartEventsAggregator } from './cart-events-aggregator.service';
import { PixelEventsAggregator } from './pixel-events-aggregator.service';
import { PixelIngestController } from './pixel-ingest.controller';
import { PixelIngestService } from './pixel-ingest.service';
import { ChannelModule } from '../channel/channel.module';

@Module({
  imports: [ChannelModule],
  controllers: [AnalyticsController, PixelIngestController],
  providers: [
    AnalyticsService,
    AnalyticsDashboardService,
    AnalyticsScheduler,
    CartEventsAggregator,
    PixelIngestService,
    PixelEventsAggregator,
  ],
  exports: [AnalyticsService, CartEventsAggregator],
})
export class AnalyticsModule { }
