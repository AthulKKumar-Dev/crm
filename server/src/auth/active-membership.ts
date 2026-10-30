import { Prisma } from '@prisma/client';

/**
 * A membership that grants access: active, in a workspace that still exists.
 * Soft-deleting a workspace leaves its member rows in place, so every query
 * that loads memberships for authorization must exclude deleted workspaces —
 * otherwise members keep working in a workspace that was "deleted".
 */
export const ACTIVE_MEMBERSHIP = {
  isActive: true,
  organization: { deletedAt: null },
} satisfies Prisma.OrganizationMemberWhereInput;
