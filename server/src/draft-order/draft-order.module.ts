import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DraftOrderService } from './draft-order.service';
import { DraftOrderController } from './draft-order.controller';
import { DraftMirrorEnqueuer } from './draft-mirror.enqueuer';
import { DraftMirrorProcessor } from './draft-mirror.processor';
import { DRAFT_MIRROR_QUEUE } from './draft-mirror.queue';
import { GstModule } from '../gst/gst.module';
import { OrderModule } from '../order/order.module';
import { OrganizationSettingsModule } from '../organization-settings/organization-settings.module';
import { ChannelModule } from '../channel/channel.module';

// WHY these imports?
//   GstModule                  — pricing math (GstCalculatorService, TaxResolverService).
//   OrderModule                — delegate to OrderService.createOfflineOrder on draft completion.
//   ChannelModule              — Shopify GraphQL client / OAuth / sync helpers for mirror methods.
//   OrganizationSettingsModule — gating logic if drafts gain settings later.
//   BullModule.registerQueue   — the draft → Shopify mirror queue (Redis-backed). Lets us
//                                run mirror operations async w/ retries instead of blocking
//                                the API request on every Shopify roundtrip.
@Module({
  imports: [
    GstModule,
    OrderModule,
    ChannelModule,
    OrganizationSettingsModule,
    BullModule.registerQueue({ name: DRAFT_MIRROR_QUEUE }),
  ],
  controllers: [DraftOrderController],
  providers: [DraftOrderService, DraftMirrorEnqueuer, DraftMirrorProcessor],
  exports: [DraftOrderService],
})
export class DraftOrderModule {}
