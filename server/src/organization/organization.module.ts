import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { OrganizationService } from './organization.service';
import { MembersService } from './members.service';
import { InvitesService } from './invites.service';
import { OrganizationController } from './organization.controller';
import { MembersController } from './members.controller';
import { InvitesController } from './invites.controller';

// WHY import UserModule?
// OrganizationController needs UserService.findById() to get firstName for personal workspace.
// UserModule exports UserService, so we import the module to make it available.
//
// WHY export OrganizationService and MembersService?
// Other modules may need to check org membership or roles in the future.
@Module({
  imports: [UserModule],
  controllers: [OrganizationController, MembersController, InvitesController],
  providers: [OrganizationService, MembersService, InvitesService],
  exports: [OrganizationService, MembersService],
})
export class OrganizationModule { }