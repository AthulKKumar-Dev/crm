import { UserRole } from '@prisma/client';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/**
 * The vendor scope to apply for this request: the member's `vendorScope` when the
 * role is VENDOR, otherwise `undefined` (no scoping for normal roles).
 *
 * `VendorAccessGuard` already guarantees a VENDOR reaching an `@AllowVendor()`
 * route carries a non-empty scope, so callers can treat a returned value as a
 * hard filter.
 */
export function vendorScopeFor(user: JwtPayload): string | undefined {
  return user.role === UserRole.VENDOR ? user.vendorScope ?? undefined : undefined;
}
