import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_SUPER_ADMIN_KEY } from '../decorators/super-admin.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Guard that enforces the @SuperAdmin() decorator.
 *
 * Passes when:
 *   - the route/controller is NOT marked @SuperAdmin(), OR
 *   - the caller's JWT has `isSuperAdmin === true`, OR
 *   - the caller has `impersonatedBy` set — this is intentional so that an impersonated
 *     session can still hit `/admin/stop-impersonating` to return to its super-admin self.
 *     (stopImpersonation itself re-verifies the super admin via the impersonatedBy claim.)
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const required = this.reflector.getAllAndOverride<boolean>(IS_SUPER_ADMIN_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!required) return true;

        const user = context.switchToHttp().getRequest<{ user: JwtPayload }>().user;
        if (user?.isSuperAdmin || user?.impersonatedBy) return true;

        throw new ForbiddenException('Super admin access required');
    }
}
