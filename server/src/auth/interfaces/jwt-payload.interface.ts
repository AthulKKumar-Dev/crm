import { UserRole } from '@prisma/client';

export interface JwtPayload {
    sub: string;
    email: string;
    orgId?: string;
    role?: UserRole;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}