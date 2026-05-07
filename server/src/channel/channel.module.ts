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
import { ShopifyPushService } from './shopify-push.service';
import { ShopifyPushProcessor } from './shopify-push.processor';
import { ShopifyPushEnqueuer } from './shopify-push.enqueuer';
import { SyncProcessor } from './sync.processor';
import { EncryptionService } from './encryption.service';
import { SYNC_QUEUE } from './sync.queue';
import { SHOPIFY_PUSH_QUEUE } from './shopify-push.queue';
import { WHATSAPP_MESSAGING_QUEUE } from './whatsapp.queue';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: SYNC_QUEUE }),
    BullModule.registerQueue({ name: SHOPIFY_PUSH_QUEUE }),
    BullModule.registerQueue({ name: WHATSAPP_MESSAGING_QUEUE }),
    LoyaltyModule,
  ],
  controllers: [ChannelController, ShopifyWebhookController, InstagramWebhookController],
  providers: [
    ChannelService, ShopifyOAuthService, InstagramOAuthService, WhatsAppOAuthService,
    WhatsAppMessagingService, WhatsAppMessagingProcessor, WhatsAppTriggerService,
    ShopifySyncService, SyncProcessor, EncryptionService,
    ShopifyPushService, ShopifyPushProcessor, ShopifyPushEnqueuer,
  ],
  exports: [
    ChannelService, ShopifyOAuthService, InstagramOAuthService, WhatsAppOAuthService,
    WhatsAppMessagingService, WhatsAppTriggerService,
    ShopifySyncService, EncryptionService,
    ShopifyPushService, ShopifyPushEnqueuer,
  ],
})
export class ChannelModule { }
