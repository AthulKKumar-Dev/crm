import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { IMPLICIT_ALL_ROLES, PermissionKey } from '../permissions';
import { SessionPayload } from '../interfaces/jwt-payload.interface';

/**
 * Enforces `@RequirePermissions(...)`. Allow-by-default: routes without the
 * decorator are untouched (RolesGuard and VendorAccessGuard already ran).
 *
 * Resolution:
 *   - OWNER / ADMIN / MANAGER pass every check (implicit full grant).
 *   - AGENT / VIEWER pass when the session's `permissions` (loaded from
 *     OrganizationMember.permissions by JwtStrategy, Redis-cached alongside
 *     role) contain ALL required keys.
 *   - VENDOR is always refused — floor access for vendors is a V2 question.
 *
 * Freshness: permission edits go through the member PATCH endpoint, which
 * already calls `redis.deleteSession(userId)` — the same staleness story as
 * role changes.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const user = context
      .switchToHttp()
      .getRequest<{ user?: SessionPayload }>().user;
    if (!user?.role) return false;

    if (user.role === UserRole.VENDOR) {
      throw new ForbiddenException('Vendors cannot access inventory operations.');
    }
    if (IMPLICIT_ALL_ROLES.includes(user.role)) return true;

    const held = new Set(user.permissions ?? []);
    const missing = required.filter((key) => !held.has(key));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing permission${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      );
    }
    return true;
  }
}
