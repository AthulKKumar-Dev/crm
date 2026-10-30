import { UserRole } from '@prisma/client';
import { SessionPayload } from './interfaces/jwt-payload.interface';
import { extractGrants } from './permissions';

interface MembershipRow {
  organizationId: string;
  role: UserRole;
  vendorScope: string | null;
  permissions: unknown;
}

/**
 * The Redis session written whenever tokens are issued. One builder so every
 * path caches the member's grants — login, switch-org, refresh and
 * impersonation each used to write the session without `permissions`, which
 * left PermissionsGuard / SectionAccessGuard reading an empty grant list
 * until the cache happened to be rebuilt by JwtStrategy.
 */
export function buildSessionPayload(
  user: { id: string; email: string; emailVerified: boolean },
  membership: MembershipRow | undefined,
  memberships: MembershipRow[],
  flags: { isSuperAdmin: boolean; impersonatedBy?: string },
): Record<string, unknown> {
  const session: SessionPayload = {
    sub: user.id,
    email: user.email,
    orgId: membership?.organizationId,
    role: membership?.role,
    vendorScope: membership?.vendorScope ?? undefined,
    permissions: extractGrants(membership?.permissions),
    emailVerified: user.emailVerified,
    memberships: memberships.map((m) => ({
      orgId: m.organizationId,
      role: m.role,
      vendorScope: m.vendorScope ?? undefined,
      permissions: extractGrants(m.permissions),
    })),
    isSuperAdmin: flags.isSuperAdmin,
    ...(flags.impersonatedBy ? { impersonatedBy: flags.impersonatedBy } : {}),
  };
  return session as unknown as Record<string, unknown>;
}
