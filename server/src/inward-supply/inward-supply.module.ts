import { Module } from '@nestjs/common';
import { InwardSupplyService } from './inward-supply.service';
import { InwardSupplyController } from './inward-supply.controller';

@Module({
  controllers: [InwardSupplyController],
  providers: [InwardSupplyService],
  exports: [InwardSupplyService],
})
export class InwardSupplyModule {}
