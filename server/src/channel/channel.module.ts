import { Module } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyWebhookController } from './shopify-webhook.controller';
import { EncryptionService } from './encryption.service';

@Module({
  controllers: [ChannelController, ShopifyWebhookController],
  providers: [ChannelService, ShopifyOAuthService, EncryptionService],
  exports: [ChannelService, ShopifyOAuthService, EncryptionService],
})
export class ChannelModule { }