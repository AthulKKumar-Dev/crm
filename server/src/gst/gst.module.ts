import { Module } from '@nestjs/common';
import { GstController } from './gst.controller';
import { GstService } from './gst.service';
import { GstCalculatorService } from './gst-calculator.service';
import { TaxResolverService } from './tax-resolver.service';

@Module({
  controllers: [GstController],
  providers: [GstService, GstCalculatorService, TaxResolverService],
  exports: [GstService, GstCalculatorService, TaxResolverService],
})
export class GstModule {}
