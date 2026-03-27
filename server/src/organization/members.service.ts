import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MembersService {
    constructor(private readonly prisma: PrismaService) { }

    // ─── LIST MEMBERS ───
    // Returns all active members with their user profile info.
    // WHY select specific user fields? We never want to expose passwords or 2FA secrets.
    async findAll(orgId: string) {
        const members = await this.prisma.organizationMember.findMany({
            where: { organizationId: orgId, isActive: true },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        avatarUrl: true,
                        lastLoginAt: true,
                    },
                },
            },
            orderBy: { joinedAt: 'asc' },
        });

        return members.map((m) => ({
            id: m.id,
            role: m.role,
            joinedAt: m.joinedAt,
            user: m.user,
        }));
    }

    // ─── UPDATE ROLE ───
    // WHY protect OWNER? The org creator (OWNER) can never be demoted.
    // WHY prevent assigning OWNER? There can only be one OWNER per org.
    async updateRole(orgId: string, memberId: string, role: UserRole) {
        const member = await this.prisma.organizationMember.findFirst({
            where: { id: memberId, organizationId: orgId, isActive: true },
        });

        if (!member) throw new NotFoundException('Member not found');
        if (member.role === UserRole.OWNER) {
            throw new ForbiddenException('Cannot change the role of the organization owner');
        }
        if (role === UserRole.OWNER) {
            throw new ForbiddenException('Cannot assign OWNER role');
        }

        return this.prisma.organizationMember.update({
            where: { id: memberId },
            data: { role },
        });
    }

    // ─── REMOVE MEMBER ───
    // WHY isActive=false instead of DELETE? Soft removal preserves:
    // - Their notes/messages/assigned conversations still reference them
    // - They can be re-invited later (the row exists but inactive)
    // - Audit trail of who was in the org
    async remove(orgId: string, memberId: string) {
        const member = await this.prisma.organizationMember.findFirst({
            where: { id: memberId, organizationId: orgId, isActive: true },
        });

        if (!member) throw new NotFoundException('Member not found');
        if (member.role === UserRole.OWNER) {
            throw new ForbiddenException('Cannot remove the organization owner');
        }

        return this.prisma.organizationMember.update({
            where: { id: memberId },
            data: { isActive: false },
        });
    }
}