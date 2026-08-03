import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PermissionsGuard } from './permissions.guard';
import type { PermissionKey } from '../permissions';

function contextFor(user: Record<string, unknown> | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let reflector: Reflector;
  let guard: PermissionsGuard;
  let required: PermissionKey[] | undefined;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(() => required),
    } as unknown as Reflector;
    guard = new PermissionsGuard(reflector);
  });

  it('allows any route without @RequirePermissions (allow-by-default)', () => {
    required = undefined;
    expect(guard.canActivate(contextFor({ role: UserRole.VIEWER }))).toBe(true);
  });

  it('grants OWNER/ADMIN/MANAGER implicitly', () => {
    required = ['inventory.adjust'];
    for (const role of [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER]) {
      expect(guard.canActivate(contextFor({ role, permissions: [] }))).toBe(true);
    }
  });

  it('grants AGENT only the keys in their permissions array', () => {
    required = ['inventory.pick'];
    expect(
      guard.canActivate(
        contextFor({ role: UserRole.AGENT, permissions: ['inventory.view', 'inventory.pick'] }),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        contextFor({ role: UserRole.AGENT, permissions: ['inventory.view'] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('requires ALL listed keys, not any', () => {
    required = ['inventory.view', 'inventory.adjust'];
    expect(() =>
      guard.canActivate(
        contextFor({ role: UserRole.AGENT, permissions: ['inventory.view'] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('lets a VIEWER through with an explicit grant (Accounts preset)', () => {
    required = ['reports.finance'];
    expect(
      guard.canActivate(
        contextFor({ role: UserRole.VIEWER, permissions: ['reports.finance'] }),
      ),
    ).toBe(true);
  });

  it('always refuses VENDOR, even with grants', () => {
    required = ['inventory.view'];
    expect(() =>
      guard.canActivate(
        contextFor({ role: UserRole.VENDOR, permissions: ['inventory.view'] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('denies when there is no session role', () => {
    required = ['inventory.view'];
    expect(guard.canActivate(contextFor(undefined))).toBe(false);
    expect(guard.canActivate(contextFor({}))).toBe(false);
  });

  it('treats a missing permissions array as no grants', () => {
    required = ['inventory.view'];
    expect(() =>
      guard.canActivate(contextFor({ role: UserRole.AGENT })),
    ).toThrow(ForbiddenException);
  });
});
