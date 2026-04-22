import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyWebhookController } from './shopify-webhook.controller';
import { InstagramOAuthService } from './instagram-oauth.service';
import { InstagramWebhookController } from './instagram-webhook.controller';
import { WhatsAppOAuthService } from './whatsapp-oauth.service';
import { ShopifySyncService } from './shopify-sync.service';
import { SyncProcessor } from './sync.processor';
import { EncryptionService } from './encryption.service';
import { SYNC_QUEUE } from './sync.queue';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: SYNC_QUEUE }),
    LoyaltyModule,
  ],
  controllers: [ChannelController, ShopifyWebhookController, InstagramWebhookController],
  providers: [
    ChannelService, ShopifyOAuthService, InstagramOAuthService, WhatsAppOAuthService,
    ShopifySyncService, SyncProcessor, EncryptionService,
  ],
  exports: [
    ChannelService, ShopifyOAuthService, InstagramOAuthService, WhatsAppOAuthService,
    ShopifySyncService, EncryptionService,
  ],
})
export class ChannelModule { }