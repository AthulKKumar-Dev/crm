import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route to specific roles.
 *
 * `RolesGuard` is ALLOW-by-default: a route with no `@Roles(...)` is open to
 * every authenticated member. Read endpoints rely on that deliberately, so
 * VIEWER keeps full read access. Every *mutating* endpoint should declare a
 * group below.
 *
 * ORDERING TRAP: the global guard chain is
 *   Throttler → Jwt → **Roles** → OrgRequired → **VendorAccess** → SuperAdmin
 * so `RolesGuard` runs BEFORE `VendorAccessGuard`. Any route marked
 * `@AllowVendor()` must therefore use a group that INCLUDES `VENDOR`
 * (`ORG_OPERATORS_AND_VENDORS`), or vendors are rejected before the vendor
 * guard ever runs.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Money and statutory/config actions: cancelling or capturing an order,
 * marking it paid, issuing or cancelling a GST invoice, editing tax setup.
 */
export const ORG_MANAGERS: UserRole[] = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
];

/**
 * Day-to-day order work: creating orders and drafts, editing them, archiving,
 * pushing to Shopify. Everything a MANAGER can do minus the financial and
 * statutory actions above.
 */
export const ORG_OPERATORS: UserRole[] = [...ORG_MANAGERS, UserRole.AGENT];

/**
 * Fulfilment and tracking — work external suppliers perform too. VENDOR is
 * still confined to its own line items by `VendorAccessGuard` + `vendorScope`
 * checks in the services; this group only gets it past `RolesGuard`.
 */
export const ORG_OPERATORS_AND_VENDORS: UserRole[] = [
  ...ORG_OPERATORS,
  UserRole.VENDOR,
];
