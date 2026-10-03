import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_SECTION_KEY } from '../decorators/require-section.decorator';
import { resolveSections, SectionKey } from '../permissions';
import { SessionPayload } from '../interfaces/jwt-payload.interface';

/**
 * Enforces `@RequireSection(...)`. Allow-by-default: routes without the
 * decorator (or with an empty one) are untouched.
 *
 * Resolution (see `resolveSections`):
 *   - OWNER / ADMIN / MANAGER and VENDOR pass — vendors are already governed
 *     by VendorAccessGuard and their vendor scope.
 *   - AGENT / VIEWER with no `section.*` grant pass (not configured yet).
 *   - Otherwise the member must hold ANY of the listed sections.
 *
 * The message prefix "Section access denied" is matched by the client to
 * re-sync the member's access, so keep it stable.
 */
@Injectable()
export class SectionAccessGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<SectionKey[]>(
      REQUIRE_SECTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const user = context
      .switchToHttp()
      .getRequest<{ user?: SessionPayload }>().user;
    if (!user?.role) return false;

    const sections = resolveSections(user.role, user.permissions ?? []);
    if (sections === 'all') return true;
    if (required.some((key) => sections.has(key))) return true;

    throw new ForbiddenException(
      `Section access denied: ${required[0].replace('section.', '')}`,
    );
  }
}
