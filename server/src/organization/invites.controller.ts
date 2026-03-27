import { Controller, Post, Get, Delete, Body, Param } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrganizationService } from './organization.service';
import { InvitesService } from './invites.service';
import { SendInviteDto } from './dto/send-invite.dto';

// Route: /api/v1/organizations/:orgId/invites
// All endpoints require JWT + OWNER/ADMIN role
@Controller('organizations/:orgId/invites')
export class InvitesController {
    constructor(
        private readonly invitesService: InvitesService,
        private readonly orgService: OrganizationService,
    ) { }

    // POST — send a new invite
    @Post()
    async send(
        @Param('orgId') orgId: string,
        @CurrentUser() user: JwtPayload,
        @Body() dto: SendInviteDto,
    ) {
        await this.orgService.requireRole(orgId, user.sub, [UserRole.OWNER, UserRole.ADMIN]);
        return this.invitesService.send(orgId, user.sub, dto);
    }

    // GET — list pending invites
    @Get()
    async findAll(@Param('orgId') orgId: string, @CurrentUser() user: JwtPayload) {
        await this.orgService.requireRole(orgId, user.sub, [UserRole.OWNER, UserRole.ADMIN]);
        return this.invitesService.findAllPending(orgId);
    }

    // DELETE — revoke a pending invite
    @Delete(':inviteId')
    async revoke(
        @Param('orgId') orgId: string,
        @Param('inviteId') inviteId: string,
        @CurrentUser() user: JwtPayload,
    ) {
        await this.orgService.requireRole(orgId, user.sub, [UserRole.OWNER, UserRole.ADMIN]);
        return this.invitesService.revoke(orgId, inviteId);
    }
}