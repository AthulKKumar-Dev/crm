import { Module } from '@nestjs/common';
import { OrganizationSettingsService } from './organization-settings.service';
import { OrganizationSettingsController } from './organization-settings.controller';

@Module({
  controllers: [OrganizationSettingsController],
  providers: [OrganizationSettingsService],
  exports: [OrganizationSettingsService],
})
export class OrganizationSettingsModule {}
