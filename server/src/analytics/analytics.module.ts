import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsScheduler } from './analytics.scheduler';
import { CartEventsAggregator } from './cart-events-aggregator.service';
import { ChannelModule } from '../channel/channel.module';

@Module({
  imports: [ChannelModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsScheduler, CartEventsAggregator],
  exports: [AnalyticsService, CartEventsAggregator],
})
export class AnalyticsModule {}
