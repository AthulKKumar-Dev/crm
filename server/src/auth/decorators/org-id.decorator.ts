import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Resolves the caller's organization id from the JWT session.
 * Throws if missing — never pass `undefined` into Prisma where-clauses
 * (Prisma drops undefined filters and would return cross-tenant rows).
 */
export const OrgId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const orgId = request.user?.orgId;
    if (!orgId) {
      throw new ForbiddenException(
        'You must create or join an organization before accessing this resource.',
      );
    }
    return orgId;
  },
);
