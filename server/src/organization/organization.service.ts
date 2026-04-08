import {
  Injectable,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Organization, OrganizationType, UserRole } from '@prisma/client';
import slugify from 'slugify';
import { randomBytes } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) { }

  // ─── CREATE ORGANIZATION ───
  // Creates a team org (type: ORGANIZATION) with the current user as OWNER.
  // WHY Prisma nested create? We create the org AND the membership in one query.
  // This is atomic — if either fails, neither is saved.
  async create(userId: string, dto: CreateOrganizationDto) {
    // Generate slug from name if not provided
    // slugify("Acme Store") → "acme-store"
    // We add a random suffix to prevent slug collisions
    const slug = dto.slug || this.generateSlug(dto.name);

    const org = await this.prisma.organization.create({
      data: {
        name: dto.name,
        slug,
        type: OrganizationType.ORGANIZATION,
        logo: dto.logo,
        timezone: dto.timezone,
        currency: dto.currency,
        industry: dto.industry,
        website: dto.website,
        // Nested create: automatically creates an OrganizationMember row
        // linking this user to this org with OWNER role
        members: {
          create: { userId, role: UserRole.OWNER },
        },
      },
      include: { members: true },
    });

    return this.formatOrg(org, UserRole.OWNER);
  }

  // ─── CREATE PERSONAL WORKSPACE ───
  // Creates a solo workspace (type: PERSONAL) — one member, no team features.
  // WHY check for existing? Each user can only have ONE personal workspace.
  async createPersonal(userId: string, firstName: string) {
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

    // Auto-generate name and slug — user doesn't need to input anything
    const slug = `${firstName.toLowerCase()}-${randomBytes(4).toString('hex')}`;

    const org = await this.prisma.organization.create({
      data: {
        name: `${firstName}'s Workspace`,
        slug,
        type: OrganizationType.PERSONAL,
        members: {
          create: { userId, role: UserRole.OWNER },
        },
      },
      include: { members: true },
    });

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
      lowStockThreshold: org.lowStockThreshold,
      gstEnabled: org.gstEnabled,
      onboardingStatus: org.onboardingStatus,
      role,
      createdAt: org.createdAt,
    };
  }
}