import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { NO_ORG_REQUIRED_KEY } from '../decorators/no-org-required.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Deny-by-default: every authenticated route requires a JWT orgId unless
 * the handler/controller is marked @Public() or @NoOrgRequired().
 *
 * WHY: If a user has no organization (just signed up, hasn't created/joined
 * an org yet), their JWT contains orgId=undefined. When Prisma receives
 * organizationId=undefined, it IGNORES the filter and returns ALL records
 * from ALL organizations. This guard blocks that data leak / destructive write.
 *
 * Do NOT maintain a class-name allowlist — it goes stale and breaks under
 * minification. Opt out explicitly with @NoOrgRequired() instead.
 */
@Injectable()
export class OrgRequiredGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) return true;

        const noOrgRequired = this.reflector.getAllAndOverride<boolean>(NO_ORG_REQUIRED_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (noOrgRequired) return true;

        const request = context.switchToHttp().getRequest();
        const user = request.user as JwtPayload | undefined;

        // No user — JwtAuthGuard handles unauthenticated requests
        if (!user) return true;

        if (!user.orgId) {
            throw new ForbiddenException(
                'You must create or join an organization before accessing this resource.',
            );
        }

        return true;
    }
}
