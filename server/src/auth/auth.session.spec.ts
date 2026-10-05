import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

/**
 * An access token is only honoured while its server-side session (`sid`) is
 * live. Logout and revocation delete the session, so the token dies with it
 * instead of working until it expires.
 */
describe('JwtStrategy.validate — session must be live', () => {
  const cached = { sub: 'u1', email: 'u1@example.com', orgId: 'org-a', emailVerified: true, memberships: [] };

  function build(isAuthSessionActive: jest.Mock) {
    const redis = {
      isAuthSessionActive,
      getSession: jest.fn().mockResolvedValue(cached),
      setSession: jest.fn().mockResolvedValue(undefined),
    };
    const config = { get: jest.fn().mockReturnValue('test-secret') };
    const prisma = { user: { findFirst: jest.fn() } };
    return { strategy: new JwtStrategy(config as never, redis as never, prisma as never), redis, prisma };
  }

  const payload = { sub: 'u1', email: 'u1@example.com', orgId: 'org-a', sid: 's1' };

  it('accepts a token whose session is live and exposes the sid', async () => {
    const { strategy, redis } = build(jest.fn().mockResolvedValue(true));

    await expect(strategy.validate(payload)).resolves.toMatchObject({ sub: 'u1', sid: 's1' });
    expect(redis.isAuthSessionActive).toHaveBeenCalledWith('s1', 'u1');
  });

  it('rejects a token whose session was revoked', async () => {
    const { strategy, redis } = build(jest.fn().mockResolvedValue(false));

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.getSession).not.toHaveBeenCalled();
  });

  it('rejects a token issued without a session', async () => {
    const { strategy, redis } = build(jest.fn().mockResolvedValue(true));

    await expect(strategy.validate({ ...payload, sid: undefined })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.isAuthSessionActive).not.toHaveBeenCalled();
  });

  it('answers 503, not 401, when Redis cannot be reached', async () => {
    const { strategy, prisma } = build(jest.fn().mockRejectedValue(new Error('redis down')));

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});

describe('AuthService — session lifecycle', () => {
  function build(stored: { userId: string; orgId?: string; sid?: string } | null, touch = true) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'u1@example.com',
          deletedAt: null,
          emailVerified: true,
          isSuperAdmin: false,
          memberships: [{ organizationId: 'org-a', role: 'OWNER', vendorScope: null }],
        }),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const redis = {
      getRefreshToken: jest.fn().mockResolvedValue(stored),
      deleteRefreshToken: jest.fn().mockResolvedValue(undefined),
      setRefreshToken: jest.fn().mockResolvedValue(undefined),
      trackUserToken: jest.fn().mockResolvedValue(undefined),
      setSession: jest.fn().mockResolvedValue(undefined),
      deleteSession: jest.fn().mockResolvedValue(undefined),
      setAuthSession: jest.fn<Promise<void>, [string, string]>().mockResolvedValue(undefined),
      touchAuthSession: jest.fn().mockResolvedValue(touch),
      deleteAuthSession: jest.fn().mockResolvedValue(undefined),
      deleteAllAuthSessions: jest.fn().mockResolvedValue(undefined),
      deleteAllUserTokens: jest.fn().mockResolvedValue(undefined),
    };
    const jwt = { sign: jest.fn().mockReturnValue('access') };
    const config = { get: jest.fn().mockReturnValue('7d') };

    const service = new AuthService(
      prisma as never,
      jwt as never,
      config as never,
      {} as never,
      {} as never,
      redis as never,
    );
    return { service, redis, jwt };
  }

  it('gives a new token pair a session and signs it into the access token', async () => {
    const { service, redis, jwt } = build(null);

    await service.generateTokenPair({ sub: 'u1', email: 'u1@example.com' });

    const sid = redis.setAuthSession.mock.calls[0][0];
    expect(redis.setAuthSession).toHaveBeenCalledWith(sid, 'u1');
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ sid }));
    expect(redis.setRefreshToken).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ sid }));
  });

  it('keeps the same session across a refresh', async () => {
    const { service, redis, jwt } = build({ userId: 'u1', orgId: 'org-a', sid: 's1' });

    await service.rotateRefreshToken('old');

    expect(redis.touchAuthSession).toHaveBeenCalledWith('s1', 'u1');
    expect(redis.setAuthSession).not.toHaveBeenCalled();
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ sid: 's1' }));
    expect(redis.setRefreshToken).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ sid: 's1' }));
  });

  it('refuses a refresh whose session was revoked instead of re-creating it', async () => {
    const { service, redis, jwt } = build({ userId: 'u1', orgId: 'org-a', sid: 's1' }, false);

    await expect(service.rotateRefreshToken('old')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.setAuthSession).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
    expect(redis.setRefreshToken).not.toHaveBeenCalled();
  });

  it('starts a session for a refresh token issued before sessions existed', async () => {
    const { service, redis, jwt } = build({ userId: 'u1', orgId: 'org-a' });

    await service.rotateRefreshToken('old');

    const sid = redis.setAuthSession.mock.calls[0][0];
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ sid }));
  });

  it('ends the session on logout', async () => {
    const { service, redis } = build({ userId: 'u1' });

    await service.logout('u1', 's1', 'refresh');

    expect(redis.deleteAuthSession).toHaveBeenCalledWith('s1', 'u1');
  });

  it('ends every session on revoke-all', async () => {
    const { service, redis } = build(null);

    await service.revokeAllUserTokens('u1');

    expect(redis.deleteAllAuthSessions).toHaveBeenCalledWith('u1');
  });
});
