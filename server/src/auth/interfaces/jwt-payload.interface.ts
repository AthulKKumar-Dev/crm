import { UserRole } from '@prisma/client';

export interface JwtPayload {
    sub: string;
    email: string;
    orgId?: string;
    role?: UserRole;
    /** Global Collabo-team flag. Present and `true` only for super admins. */
    isSuperAdmin?: boolean;
    /** During impersonation, this is the super admin's user ID. Absent otherwise. */
    impersonatedBy?: string;
}

export interface SessionPayload extends JwtPayload {
    emailVerified: boolean;
    memberships: Array<{ orgId: string; role: UserRole }>;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}
