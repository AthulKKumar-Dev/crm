import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { ChannelModule } from '../channel/channel.module';

// WHY ChannelModule?
// ProductService.create needs ShopifyPushEnqueuer to fire a push job after
// committing a CRM-native product (when a Shopify channel is connected).
@Module({
  imports: [ChannelModule],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
