import { SetMetadata } from '@nestjs/common';

export const IS_SUPER_ADMIN_KEY = 'isSuperAdmin';

/**
 * Marks a controller or route as requiring a Collabo-team super admin.
 * Enforced by SuperAdminGuard — must be globally registered alongside JwtAuthGuard.
 */
export const SuperAdmin = () => SetMetadata(IS_SUPER_ADMIN_KEY, true);

export const ALLOW_IMPERSONATED_KEY = 'allowImpersonated';

/**
 * Lets an impersonation token through SuperAdminGuard on this one route.
 * Only `stop-impersonating` needs it — every other admin route requires a
 * real super admin.
 */
export const AllowImpersonated = () => SetMetadata(ALLOW_IMPERSONATED_KEY, true);
