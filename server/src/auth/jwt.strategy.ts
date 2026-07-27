import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { JwtPayload, SessionPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(
        config: ConfigService,
        private readonly redis: RedisService,
        private readonly prisma: PrismaService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: config.get<string>('jwt.accessSecret')!,
        });
    }

    async validate(payload: JwtPayload): Promise<SessionPayload> {
        // Try Redis cache first (sub-millisecond)
        try {
            const cached = await this.redis.getSession<SessionPayload>(payload.sub);
            if (cached) return cached;
        } catch {
            // Redis down — fall through to DB
        }

        // Cache miss — load from DB
        const user = await this.prisma.user.findFirst({
            where: { id: payload.sub, deletedAt: null },
            include: {
                memberships: {
                    where: { isActive: true },
                    include: { organization: true },
                },
            },
        });

        if (!user) throw new UnauthorizedException('User not found');

        // Honour the org the token was minted for (login/switchOrg set
        // payload.orgId) — otherwise a cache miss silently snaps a multi-org
        // user back to their first org (and its role). Tamper-proof: the
        // claim is signed, and a forged/deactivated orgId finds no active
        // membership so we fall back to the first one.
        const membership =
            user.memberships.find((m) => m.organizationId === payload.orgId) ??
            user.memberships[0];
        const session: SessionPayload = {
            sub: user.id,
            email: user.email,
            orgId: membership?.organizationId,
            role: membership?.role,
            vendorScope: membership?.vendorScope ?? undefined,
            emailVerified: user.emailVerified,
            memberships: user.memberships.map((m) => ({
                orgId: m.organizationId,
                role: m.role,
                vendorScope: m.vendorScope ?? undefined,
            })),
        };

        // Cache for subsequent requests (ignore errors)
        this.redis.setSession(user.id, session as unknown as Record<string, unknown>).catch(() => {});

        return session;
    }
}