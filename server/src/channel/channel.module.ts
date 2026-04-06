import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyWebhookController } from './shopify-webhook.controller';
import { InstagramOAuthService } from './instagram-oauth.service';
import { InstagramWebhookController } from './instagram-webhook.controller';
import { ShopifySyncService } from './shopify-sync.service';
import { SyncProcessor } from './sync.processor';
import { EncryptionService } from './encryption.service';
import { SYNC_QUEUE } from './sync.queue';

@Module({
  imports: [
    BullModule.registerQueue({ name: SYNC_QUEUE }),
  ],
  controllers: [ChannelController, ShopifyWebhookController, InstagramWebhookController],
  providers: [
    ChannelService, ShopifyOAuthService, InstagramOAuthService,
    ShopifySyncService, SyncProcessor, EncryptionService,
  ],
  exports: [
    ChannelService, ShopifyOAuthService, InstagramOAuthService,
    ShopifySyncService, EncryptionService,
  ],
})
export class ChannelModule { }