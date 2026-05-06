import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { GstModule } from '../gst/gst.module';
import { InvoiceModule } from '../invoice/invoice.module';

// WHY import GstModule + InvoiceModule?
// OrderService.createOfflineOrder needs:
//   - GstCalculatorService (line-item tax math)
//   - TaxResolverService (gstRate priority chain)
//   - InvoiceService (auto-generate the bill in the same transaction)
@Module({
  imports: [GstModule, InvoiceModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
