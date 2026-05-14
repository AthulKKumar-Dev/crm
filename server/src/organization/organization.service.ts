import {
  BadRequestException,
  Injectable,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Organization, OrganizationType, UserRole } from '@prisma/client';
import slugify from 'slugify';
import { randomBytes } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BillingService } from '../billing/billing.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CreatePersonalDto } from './dto/create-personal.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpgradeToOrganizationDto } from './dto/upgrade-to-organization.dto';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly redis: RedisService,
  ) { }

  // ─── CREATE ORGANIZATION ───
  // Creates a team org (type: ORGANIZATION) with the current user as OWNER,
  // wrapped in a transaction that also copies the User's pending Razorpay
  // subscription onto the new Organization. If no ACTIVE subscription exists,
  // billing.applyPendingSubscriptionToOrg throws and the org is rolled back —
  // server-side hard gate against bypassing payment.
  async create(userId: string, dto: CreateOrganizationDto) {
    const slug = dto.slug || this.generateSlug(dto.name);

    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: dto.name,
          slug,
          type: OrganizationType.ORGANIZATION,
          logo: dto.logo,
          timezone: dto.timezone,
          currency: dto.currency,
          industry: dto.industry,
          website: dto.website,
          billingPlan: dto.billingPlan,
          billingInterval: dto.billingInterval,
          members: { create: { userId, role: UserRole.OWNER } },
        },
        include: { members: true },
      });

      await this.billing.applyPendingSubscriptionToOrg(tx, userId, created.id);

      // Re-fetch so the returned object reflects the billing fields populated
      // by applyPendingSubscriptionToOrg.
      return tx.organization.findUniqueOrThrow({
        where: { id: created.id },
        include: { members: true },
      });
    });

    // Invalidate the cached session so the next request to JwtStrategy
    // rebuilds it from the DB and picks up the new membership. Without
    // this, a user who signed up and *just* created an org keeps the
    // pre-membership session in Redis (orgId: undefined) and every
    // org-scoped endpoint trips OrgRequiredGuard or hits Prisma with a
    // `undefined` org filter.
    await this.redis.deleteSession(userId);

    return this.formatOrg(org, UserRole.OWNER);
  }

  // ─── CREATE PERSONAL WORKSPACE ───
  // Creates a solo workspace (type: PERSONAL) — one member, no team features.
  // Same payment gate as create() above.
  async createPersonal(userId: string, firstName: string, dto: CreatePersonalDto) {
    const existing = await this.prisma.organization.findFirst({
      where: {
        type: OrganizationType.PERSONAL,
        members: { some: { userId, role: UserRole.OWNER } },
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException('You already have a personal workspace');
    }

    const slug = `${firstName.toLowerCase()}-${randomBytes(4).toString('hex')}`;

    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: `${firstName}'s Workspace`,
          slug,
          type: OrganizationType.PERSONAL,
          billingPlan: dto.billingPlan,
          billingInterval: dto.billingInterval,
          members: { create: { userId, role: UserRole.OWNER } },
        },
        include: { members: true },
      });

      await this.billing.applyPendingSubscriptionToOrg(tx, userId, created.id);

      return tx.organization.findUniqueOrThrow({
        where: { id: created.id },
        include: { members: true },
      });
    });

    // Same rationale as create() above — drop the stale (pre-membership)
    // cached session so JwtStrategy will refresh it next time.
    await this.redis.deleteSession(userId);

    return this.formatOrg(org, UserRole.OWNER);
  }

  // ─── LIST USER'S ORGS ───
  // Returns all orgs where the user is an active member.
  // Used by the frontend for the "org switcher" dropdown.
  async findAllForUser(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, isActive: true },
      include: { organization: true },
    });

    return memberships
      .filter((m) => !m.organization.deletedAt)
      .map((m) => this.formatOrg(m.organization, m.role));
  }

  // ─── GET SINGLE ORG ───
  // Verifies the user is a member before returning org details.
  async findOne(orgId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      include: { organization: true },
    });

    if (!membership || !membership.isActive) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    return this.formatOrg(membership.organization, membership.role);
  }

  // ─── UPDATE ORG ───
  // Only OWNER and ADMIN can update org settings.
  async update(orgId: string, userId: string, dto: UpdateOrganizationDto) {
    await this.requireRole(orgId, userId, [UserRole.OWNER, UserRole.ADMIN]);

    const org = await this.prisma.organization.update({
      where: { id: orgId },
      data: dto,
    });

    return org;
  }

  // ─── UPGRADE PERSONAL → ORGANIZATION ───
  // Flips a PERSONAL workspace to ORGANIZATION in place. Same row, same
  // billing subscription, same data — only the `type` changes plus the
  // org fields the user fills (name/logo/industry/website/timezone).
  //
  // Restricted to OWNER. Rejects with 400 if the org is already an
  // ORGANIZATION (no-op surface; prevents accidental downgrades the other
  // direction by never allowing the inverse).
  async upgradeToOrganization(
    orgId: string,
    userId: string,
    dto: UpgradeToOrganizationDto,
  ) {
    await this.requireRole(orgId, userId, [UserRole.OWNER]);

    const current = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { type: true, deletedAt: true },
    });
    if (!current || current.deletedAt) {
      throw new BadRequestException('Organization not found');
    }
    if (current.type !== OrganizationType.PERSONAL) {
      throw new BadRequestException(
        'This workspace is already set up as an organization.',
      );
    }

    const org = await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        type: OrganizationType.ORGANIZATION,
        name: dto.name,
        ...(dto.logo !== undefined && { logo: dto.logo }),
        ...(dto.industry !== undefined && { industry: dto.industry }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
      },
    });

    // Drop the cached session so the type flip is reflected on next request.
    // (The session payload itself doesn't carry org type, but the cached
    // memberships array does — keep them in sync.)
    await this.redis.deleteSession(userId);

    return this.formatOrg(org, UserRole.OWNER);
  }

  // ─── SOFT DELETE ORG ───
  // Only OWNER can delete. Sets deletedAt instead of actually removing.
  // WHY soft delete? Preserves billing history, enables reactivation.
  async delete(orgId: string, userId: string) {
    await this.requireRole(orgId, userId, [UserRole.OWNER]);

    await this.prisma.organization.update({
      where: { id: orgId },
      data: { deletedAt: new Date() },
    });

    return { message: 'Organization deleted' };
  }

  // ─── ROLE CHECK HELPER ───
  // Reusable method that verifies a user has one of the required roles in an org.
  // Throws ForbiddenException if not. Used by this service, MembersService, InvitesService.
  async requireRole(orgId: string, userId: string, roles: UserRole[]) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
    });

    if (!membership || !membership.isActive) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    if (!roles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return membership;
  }

  // Generates a URL-safe slug with a random suffix to prevent collisions
  private generateSlug(name: string): string {
    const base = slugify(name, { lower: true, strict: true });
    const suffix = randomBytes(3).toString('hex');
    return `${base}-${suffix}`;
  }

  // Formats org data for API response — excludes internal fields
  private formatOrg(org: Organization, role: UserRole) {
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type,
      logo: org.logo,
      timezone: org.timezone,
      currency: org.currency,
      industry: org.industry,
      website: org.website,
      billingPlan: org.billingPlan,
      billingInterval: org.billingInterval,
      lowStockThreshold: org.lowStockThreshold,
      gstEnabled: org.gstEnabled,
      loyaltyMetric: org.loyaltyMetric,
      loyaltyBronzeMin: org.loyaltyBronzeMin,
      loyaltySilverMin: org.loyaltySilverMin,
      loyaltyGoldMin: org.loyaltyGoldMin,
      loyaltyPlatinumMin: org.loyaltyPlatinumMin,
      onboardingStatus: org.onboardingStatus,
      role,
      createdAt: org.createdAt,
    };
  }
}