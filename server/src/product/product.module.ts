import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { ProductPublishScheduler } from './product-publish.scheduler';
import { ChannelModule } from '../channel/channel.module';
import { OrganizationSettingsModule } from '../organization-settings/organization-settings.module';
import { IMAGE_STORAGE } from './image-storage/image-storage.interface';
import { LocalImageStorage } from './image-storage/local.storage';
import { S3ImageStorage } from './image-storage/s3.storage';

// WHY these imports?
//   ChannelModule              — ShopifyPushEnqueuer for fire-and-forget push.
//   OrganizationSettingsModule — gating auto-push on productSettings.autoSyncToShopify.
//   IMAGE_STORAGE              — pluggable image storage; swap impl via UPLOAD_STORAGE env.
@Module({
  imports: [ChannelModule, OrganizationSettingsModule],
  controllers: [ProductController],
  providers: [
    ProductService,
    ProductPublishScheduler,
    LocalImageStorage,
    S3ImageStorage,
    {
      provide: IMAGE_STORAGE,
      useFactory: (local: LocalImageStorage, s3: S3ImageStorage) =>
        process.env.UPLOAD_STORAGE === 's3' ? s3 : local,
      inject: [LocalImageStorage, S3ImageStorage],
    },
  ],
  exports: [ProductService],
})
export class ProductModule {}
