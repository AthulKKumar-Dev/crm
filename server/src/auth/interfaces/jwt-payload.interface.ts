import { UserRole } from '@prisma/client';

export interface JwtPayload {
    sub: string;
    email: string;
    orgId?: string;
    role?: UserRole;
    /** For VENDOR role: the Product.vendor value this session is scoped to. */
    vendorScope?: string;
    /** Global Collabo-team flag. Present and `true` only for super admins. */
    isSuperAdmin?: boolean;
    /** During impersonation, this is the super admin's user ID. Absent otherwise. */
    impersonatedBy?: string;
}

export interface SessionPayload extends JwtPayload {
    emailVerified: boolean;
    memberships: Array<{ orgId: string; role: UserRole; vendorScope?: string }>;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}
