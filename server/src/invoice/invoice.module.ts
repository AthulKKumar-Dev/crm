import { Module } from '@nestjs/common';
import { GstModule } from '../gst/gst.module';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { InvoiceNumberService } from './invoice-number.service';

// WHY import GstModule?
// InvoiceService needs GstService for seller GSTIN lookup
// and GstCalculatorService for tax calculations.
@Module({
  imports: [GstModule],
  controllers: [InvoiceController],
  providers: [InvoiceService, InvoiceNumberService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
