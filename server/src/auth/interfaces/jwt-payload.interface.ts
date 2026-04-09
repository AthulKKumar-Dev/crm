import { UserRole } from '@prisma/client';

export interface JwtPayload {
    sub: string;
    email: string;
    orgId?: string;
    role?: UserRole;
}

export interface SessionPayload extends JwtPayload {
    emailVerified: boolean;
    memberships: Array<{ orgId: string; role: UserRole }>;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}