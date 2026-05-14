import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { ChannelModule } from '../channel/channel.module';
import { OrganizationSettingsModule } from '../organization-settings/organization-settings.module';

// WHY these imports?
//   ChannelModule              — ShopifyPushEnqueuer for fire-and-forget push.
//   OrganizationSettingsModule — gating auto-push on productSettings.autoSyncToShopify.
@Module({
  imports: [ChannelModule, OrganizationSettingsModule],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
