import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Guard that ensures the authenticated user has a valid orgId.
 *
 * WHY: If a user has no organization (e.g., just signed up, hasn't created/joined an org yet),
 * their JWT contains orgId=undefined. When Prisma receives organizationId=undefined,
 * it IGNORES the filter and returns ALL records from ALL organizations.
 * This guard prevents that data leak by blocking requests with no orgId.
 *
 * Public routes (@Public()) are excluded — signup, login, etc. don't need orgId.
 * Auth routes and user profile routes also don't need orgId.
 * Only org-scoped routes (orders, products, customers, channels, dashboard) need this.
 */
@Injectable()
export class OrgRequiredGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        // Skip for @Public() routes
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) return true;

        const request = context.switchToHttp().getRequest();
        const user = request.user as JwtPayload | undefined;

        // No user (shouldn't happen after JwtAuthGuard, but safe check)
        if (!user) return true; // Let JwtAuthGuard handle this

        // Check if the route controller is one that requires orgId
        const controller = context.getClass().name;
        const orgScopedControllers = [
            'OrderController', 'ProductController', 'CustomerController',
            'DashboardController', 'ChannelController', 'InvitesController',
            'MembersController',
            'OrganizationSettingsController',
            'DraftOrderController',
        ];

        if (!orgScopedControllers.includes(controller)) {
            return true; // Not an org-scoped route
        }

        // Block if no orgId
        if (!user.orgId) {
            throw new ForbiddenException(
                'You must create or join an organization before accessing this resource.',
            );
        }

        return true;
    }
}
