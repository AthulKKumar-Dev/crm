import {
    Injectable,
    ForbiddenException,
    NotFoundException,
    ConflictException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { OrganizationType, InviteStatus, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SendInviteDto } from './dto/send-invite.dto';
import { EmailService } from '../email/email.service';

// WHY invites are in OrganizationModule (not AuthModule)?
// Sending, listing, and revoking invites are org management operations.
// Only the ACCEPTANCE of an invite is in AuthModule (because it creates a user + tokens).
@Injectable()
export class InvitesService {
    private readonly logger = new Logger(InvitesService.name);

    constructor(private readonly prisma: PrismaService, private readonly emailService: EmailService) { }

    // ─── SEND INVITE ───
    // Creates a TeamInvite row and sends an email (TODO: Resend integration)
    async send(orgId: string, userId: string, dto: SendInviteDto) {
        // 1. Check org type — PERSONAL orgs cannot invite
        // WHY? Personal workspaces are solo. User must create a separate ORGANIZATION first.
        const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
        if (!org) throw new NotFoundException('Organization not found');

        if (org.type === OrganizationType.PERSONAL) {
            throw new ForbiddenException(
                'Personal workspaces cannot have team members. Create an organization first.',
            );
        }

        // 2. Cannot invite as OWNER — there can only be one OWNER
        if (dto.role === UserRole.OWNER) {
            throw new BadRequestException('Cannot invite someone as OWNER');
        }

        // 2b. VENDOR invites must be scoped to a real vendor; non-vendors carry no scope.
        let vendorScope: string | null = null;
        if (dto.role === UserRole.VENDOR) {
            const scope = dto.vendorScope?.trim();
            if (!scope) {
                throw new BadRequestException('A vendor must be selected for VENDOR invites.');
            }
            const hasProducts = await this.prisma.product.findFirst({
                where: {
                    organizationId: orgId,
                    deletedAt: null,
                    OR: [{ vendorKey: scope }, { vendor: scope }],
                },
                select: { id: true },
            });
            if (!hasProducts) {
                throw new BadRequestException(`No products found for vendor "${scope}".`);
            }
            vendorScope = scope;
        }

        // 3. Check if already a member
        const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existingUser) {
            const existingMember = await this.prisma.organizationMember.findUnique({
                where: { organizationId_userId: { organizationId: orgId, userId: existingUser.id } },
            });
            if (existingMember?.isActive) {
                throw new ConflictException('This person is already a member');
            }
        }

        // 4. Check for existing pending invite
        const existingInvite = await this.prisma.teamInvite.findFirst({
            where: { organizationId: orgId, email: dto.email, status: InviteStatus.PENDING },
        });
        if (existingInvite) {
            throw new ConflictException('An invite has already been sent to this email');
        }

        // 5. Create the invite
        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const invite = await this.prisma.teamInvite.create({
            data: {
                organizationId: orgId,
                email: dto.email,
                role: dto.role,
                vendorScope,
                token,
                invitedBy: userId,
                expiresAt,
            },
        });

        // TODO: Send invite email via Resend with link: /auth/invite/accept?token=...
        await this.emailService.sendTeamInvite(dto.email, org.name, token);
        console.log('invite created', invite);
        return {
            id: invite.id,
            email: invite.email,
            role: invite.role,
            vendorScope: invite.vendorScope,
            status: invite.status,
            token: invite.token,
            expiresAt: invite.expiresAt,
        };
    }

    // ─── LIST PENDING INVITES ───
    async findAllPending(orgId: string) {
        return this.prisma.teamInvite.findMany({
            where: { organizationId: orgId, status: InviteStatus.PENDING },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true, email: true, role: true, status: true,
                invitedBy: true, expiresAt: true, createdAt: true,
            },
        });
    }

    // ─── REVOKE INVITE ───
    // Changes status from PENDING to REVOKED. The token becomes invalid.
    async revoke(orgId: string, inviteId: string) {
        const invite = await this.prisma.teamInvite.findFirst({
            where: { id: inviteId, organizationId: orgId, status: InviteStatus.PENDING },
        });
        if (!invite) throw new NotFoundException('Invite not found');

        return this.prisma.teamInvite.update({
            where: { id: inviteId },
            data: { status: InviteStatus.REVOKED },
        });
    }
}