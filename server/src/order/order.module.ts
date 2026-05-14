import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { GstModule } from '../gst/gst.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { ChannelModule } from '../channel/channel.module';
import { OrganizationSettingsModule } from '../organization-settings/organization-settings.module';

// WHY these imports?
//   GstModule                  — tax math (GstCalculatorService, TaxResolverService).
//   InvoiceModule              — auto-generate the bill in the same transaction.
//   ChannelModule              — push the offline order to Shopify post-commit (via
//                                 ShopifyPushEnqueuer + ShopifyPushService).
//   OrganizationSettingsModule — gating auto-push on orderSettings.autoSyncToShopify.
@Module({
  imports: [GstModule, InvoiceModule, ChannelModule, OrganizationSettingsModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
