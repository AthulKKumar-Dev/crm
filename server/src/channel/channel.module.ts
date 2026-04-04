import { Module } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyWebhookController } from './shopify-webhook.controller';
import { InstagramOAuthService } from './instagram-oauth.service';
import { InstagramWebhookController } from './instagram-webhook.controller';
import { EncryptionService } from './encryption.service';

@Module({
  controllers: [ChannelController, ShopifyWebhookController, InstagramWebhookController],
  providers: [ChannelService, ShopifyOAuthService, InstagramOAuthService, EncryptionService],
  exports: [ChannelService, ShopifyOAuthService, InstagramOAuthService, EncryptionService],
})
export class ChannelModule { }