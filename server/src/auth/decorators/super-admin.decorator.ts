import { SetMetadata } from '@nestjs/common';

export const IS_SUPER_ADMIN_KEY = 'isSuperAdmin';

/**
 * Marks a controller or route as requiring a Collabo-team super admin.
 * Enforced by SuperAdminGuard — must be globally registered alongside JwtAuthGuard.
 */
export const SuperAdmin = () => SetMetadata(IS_SUPER_ADMIN_KEY, true);
