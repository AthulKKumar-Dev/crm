import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_VENDOR_KEY } from '../decorators/allow-vendor.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Deny-by-default access control for the VENDOR role.
 *
 * Non-vendor roles are unaffected (returns true immediately). A VENDOR may only
 * reach routes explicitly marked `@AllowVendor()`, and only if their session
 * carries a non-empty `vendorScope` — without it, every downstream vendor-scoped
 * query would be unsafe, so we refuse here too (defence in depth with the
 * services' own "missing scope ⇒ throw" guard).
 */
@Injectable()
export class VendorAccessGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // @Public() routes (login, refresh, invite accept …) are never gated here.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const user = context.switchToHttp().getRequest<{ user?: JwtPayload }>().user;
    if (!user || user.role !== UserRole.VENDOR) return true; // only constrains vendors

    const allowVendor = this.reflector.getAllAndOverride<boolean>(ALLOW_VENDOR_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowVendor) {
      throw new ForbiddenException('Vendors cannot access this resource.');
    }
    if (!user.vendorScope) {
      throw new ForbiddenException('Vendor account is missing its product scope.');
    }
    return true;
  }
}
