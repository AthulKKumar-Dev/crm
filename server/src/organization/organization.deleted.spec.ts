import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ACTIVE_MEMBERSHIP } from '../auth/active-membership';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { OrganizationService } from './organization.service';

/**
 * Deleting a workspace only sets `deletedAt`; its member rows stay active.
 * Every access path therefore has to treat a deleted workspace as closed —
 * members used to keep reading and changing it after it was "deleted".
 */
describe('A deleted workspace is closed to its members', () => {
  describe('OrganizationService', () => {
    function build(deletedAt: Date | null) {
      const membership = {
        isActive: true,
        role: UserRole.OWNER,
        organization: { id: 'org-a', name: 'A', slug: 'a', deletedAt },
      };
      const prisma = {
        organizationMember: {
          findUnique: jest.fn().mockResolvedValue(membership),
          findMany: jest.fn().mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]),
        },
        organization: { update: jest.fn().mockResolvedValue({ id: 'org-a' }) },
      };
      const redis = { deleteSession: jest.fn().mockResolvedValue(undefined) };
      const service = new OrganizationService(prisma as never, {} as never, redis as never);
      return { service, prisma, redis };
    }

    it('refuses role checks for a deleted workspace, even for its owner', async () => {
      const { service } = build(new Date());

      await expect(service.requireRole('org-a', 'u1', [UserRole.OWNER])).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to return a deleted workspace', async () => {
      const { service } = build(new Date());

      await expect(service.findOne('org-a', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to update a deleted workspace', async () => {
      const { service, prisma } = build(new Date());

      await expect(service.update('org-a', 'u1', { name: 'New' } as never)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('still allows a live workspace', async () => {
      const { service } = build(null);

      await expect(service.requireRole('org-a', 'u1', [UserRole.OWNER])).resolves.toMatchObject({ role: UserRole.OWNER });
    });

    it("drops every member's cached session when the workspace is deleted", async () => {
      const { service, prisma, redis } = build(null);

      await service.delete('org-a', 'u1');

      expect(prisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'org-a' }, data: { deletedAt: expect.any(Date) as Date } }),
      );
      expect(redis.deleteSession).toHaveBeenCalledWith('u1');
      expect(redis.deleteSession).toHaveBeenCalledWith('u2');
    });
  });

  // The request path and token refresh reject a token whose workspace is not
  // among the user's memberships, so excluding deleted workspaces from that
  // load is what shuts them out.
  describe('authorization queries', () => {
    const membershipsWhere = (call: unknown[]) =>
      (call[0] as { include: { memberships: { where: unknown } } }).include.memberships.where;

    it('the per-request check only loads memberships of live workspaces', async () => {
      const prisma = { user: { findFirst: jest.fn().mockResolvedValue(null) } };
      const redis = {
        isAuthSessionActive: jest.fn().mockResolvedValue(true),
        getSession: jest.fn().mockResolvedValue(null),
      };
      const strategy = new JwtStrategy({ get: () => 'secret' } as never, redis as never, prisma as never);

      await strategy.validate({ sub: 'u1', email: 'u1@example.com', orgId: 'org-a', sid: 's1' }).catch(() => undefined);

      expect(membershipsWhere(prisma.user.findFirst.mock.calls[0] as unknown[])).toEqual(ACTIVE_MEMBERSHIP);
    });

    it('an invite into a deleted workspace cannot be viewed or accepted', async () => {
      const prisma = { teamInvite: { findUnique: jest.fn().mockResolvedValue(null) } };
      const service = new AuthService(
        prisma as never,
        {} as never,
        { get: () => '7d' } as never,
        {} as never,
        {} as never,
        {} as never,
      );

      await expect(service.getInviteByToken('tok')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.acceptInvite({ token: 'tok' } as never)).rejects.toBeInstanceOf(NotFoundException);

      for (const call of prisma.teamInvite.findUnique.mock.calls as Array<[{ where: unknown }]>) {
        expect(call[0].where).toMatchObject({ token: 'tok', organization: { deletedAt: null } });
      }
    });

    it('token refresh only loads memberships of live workspaces', async () => {
      const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
      const redis = {
        consumeRefreshToken: jest.fn().mockResolvedValue({ userId: 'u1', orgId: 'org-a', sid: 's1' }),
        clearRefreshRotation: jest.fn().mockResolvedValue(undefined),
      };
      const service = new AuthService(
        prisma as never,
        {} as never,
        { get: () => '7d' } as never,
        {} as never,
        {} as never,
        redis as never,
      );

      await service.rotateRefreshToken('old').catch(() => undefined);

      expect(membershipsWhere(prisma.user.findUnique.mock.calls[0] as unknown[])).toEqual(ACTIVE_MEMBERSHIP);
    });
  });
});
