import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyWebhookController } from './shopify-webhook.controller';
import { InstagramOAuthService } from './instagram-oauth.service';
import { InstagramWebhookController } from './instagram-webhook.controller';
import { WhatsAppOAuthService } from './whatsapp-oauth.service';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';
import { WhatsAppMessagingProcessor } from './whatsapp.processor';
import { WhatsAppTriggerService } from './whatsapp-trigger.service';
import { ShopifySyncService } from './shopify-sync.service';
import { ShopifyAnalyticsService } from './shopify-analytics.service';
import { ShopifyPushService } from './shopify-push.service';
import { ShopifyPushProcessor } from './shopify-push.processor';
import { ShopifyPushEnqueuer } from './shopify-push.enqueuer';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import { SyncProcessor } from './sync.processor';
import { EncryptionService } from './encryption.service';
import { SYNC_QUEUE } from './sync.queue';
import { SHOPIFY_PUSH_QUEUE } from './shopify-push.queue';
import { WHATSAPP_MESSAGING_QUEUE } from './whatsapp.queue';
import { DRAFT_MIRROR_QUEUE } from '../draft-order/draft-mirror.queue';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { OrganizationSettingsModule } from '../organization-settings/organization-settings.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: SYNC_QUEUE }),
    BullModule.registerQueue({ name: SHOPIFY_PUSH_QUEUE }),
    BullModule.registerQueue({ name: WHATSAPP_MESSAGING_QUEUE }),
    // Register a reference to the draft-mirror queue so ShopifySyncService
    // can enqueue `bulk-mirror` trigger jobs without depending on the
    // DraftOrderModule (which already depends on us). BullMQ multi-registers
    // are safe — they share the same underlying Redis queue.
    BullModule.registerQueue({ name: DRAFT_MIRROR_QUEUE }),
    LoyaltyModule,
    OrganizationSettingsModule,
  ],
  controllers: [ChannelController, ShopifyWebhookController, InstagramWebhookController],
  providers: [
    ChannelService, ShopifyOAuthService, InstagramOAuthService, WhatsAppOAuthService,
    WhatsAppMessagingService, WhatsAppMessagingProcessor, WhatsAppTriggerService,
    ShopifySyncService, ShopifyAnalyticsService, SyncProcessor, EncryptionService,
    ShopifyPushService, ShopifyPushProcessor, ShopifyPushEnqueuer,
    ShopifyGraphqlClient,
  ],
  exports: [
    ChannelService, ShopifyOAuthService, InstagramOAuthService, WhatsAppOAuthService,
    WhatsAppMessagingService, WhatsAppTriggerService,
    ShopifySyncService, ShopifyAnalyticsService, EncryptionService,
    ShopifyPushService, ShopifyPushEnqueuer,
    ShopifyGraphqlClient,
  ],
})
export class ChannelModule { }
