import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { InviteStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UserService } from '../user/user.service';
import { JwtPayload, TokenPair } from './interfaces/jwt-payload.interface';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshExpires: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly userService: UserService,
    private readonly emailService: EmailService,
    private readonly redis: RedisService,
  ) {
    this.refreshExpires = this.config.get<string>('jwt.refreshExpires') || '7d';
  }

  // ─── AUTH FLOWS ───

  async signup(dto: SignupDto) {
    const user = await this.userService.create({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      avatarUrl: dto.avatarUrl,
    });

    // TODO: Send verification email via Resend
    await this.emailService.sendVerificationCode(user.email, user.emailVerifyCode as string);

    return {
      userId: user.id,
      email: user.email,
      verifyCode: user.emailVerifyCode as string,
      message: 'Verification code sent to your email.',
      nextStep: 'verify-email',
    };
  }

  async verifyEmail(userId: string, code: string) {
    const user = await this.userService.verifyEmail(userId, code);

    const userWithMemberships = await this.userService.findByIdWithMemberships(user.id);
    const membership = userWithMemberships?.memberships[0];

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      orgId: membership?.organizationId,
      role: membership?.role,
    };

    const tokens = await this.generateTokenPair(payload);

    const hasOrgs = (userWithMemberships?.memberships.length ?? 0) > 0;

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        emailVerified: true,
      },
      organizations: (userWithMemberships?.memberships ?? []).map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        type: m.organization.type,
        role: m.role,
      })),
      nextStep: hasOrgs ? null : 'choose-account-type',
      message: 'Email verified successfully.',
    };
  }

  async resendVerification(userId: string) {
    const user = await this.userService.regenerateVerifyCode(userId);
    if (user) {
      await this.emailService.sendVerificationCode(user.email, user.emailVerifyCode as string);
    }
    return {
      message: 'Verification code sent.|',
      nextStep: 'verify-email',
      code: user?.emailVerifyCode,
    };
  }

  async login(dto: LoginDto, userAgent?: string, ipAddress?: string) {
    // Rate limit check — block after 5 failed attempts per email
    const attempts = await this.redis.getLoginAttempts(dto.email);
    if (this.redis.isLoginBlocked(attempts)) {
      throw new UnauthorizedException('Too many failed login attempts. Please try again in 15 minutes.');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        memberships: { where: { isActive: true }, include: { organization: true } },
      },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isValid = await bcrypt.compare(dto.password, user.password);
    if (!isValid) {
      await this.redis.incrementLoginAttempts(dto.email);
      throw new UnauthorizedException('Invalid email or password');
    }

    // CHANGED: include userId in error so frontend can redirect to OTP page
    if (!user.emailVerified) {
      // Resend OTP automatically 
      const updatedUser = await this.userService.regenerateVerifyCode(user.id);
      if (updatedUser) {
        await this.emailService.sendVerificationCode(user.email, updatedUser.emailVerifyCode!);
      }

      throw new HttpException(
        {
          statusCode: 403,
          message: 'Please verify your email before logging in',
          userId: user.id,
          nextStep: 'verify-email',
        },
        403,
      );
    }

    if (user.twoFactorEnabled) {
      if (!dto.totpCode) {
        throw new ForbiddenException('Two-factor authentication code required');
      }
      // TODO: Validate TOTP
    }

    // Reset rate limit on successful login
    await this.redis.resetLoginAttempts(dto.email);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const membership = user.memberships[0];
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      orgId: membership?.organizationId,
      role: membership?.role,
    };

    const tokens = await this.generateTokenPair(payload);

    // Cache session in Redis
    await this.redis.setSession(user.id, {
      sub: user.id, email: user.email,
      orgId: membership?.organizationId, role: membership?.role,
      emailVerified: user.emailVerified,
      memberships: user.memberships.map((m) => ({ orgId: m.organizationId, role: m.role })),
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
      },
      organizations: user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        type: m.organization.type,
        role: m.role,
      })),
      nextStep: user.memberships.length === 0 ? 'choose-account-type' : null,
    };
  }

  async switchOrg(userId: string, orgId: string) {
    // Verify user is an active member of this org
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      include: { organization: true },
    });

    if (!membership || !membership.isActive) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    if (membership.organization.deletedAt) {
      throw new ForbiddenException('This organization has been deleted');
    }

    // Get user info + all memberships
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { where: { isActive: true }, include: { organization: true } } },
    });

    if (!user) throw new NotFoundException('User not found');

    // Generate new JWT scoped to the selected org
    const payload: JwtPayload = {
      sub: userId,
      email: user.email,
      orgId: membership.organizationId,
      role: membership.role,
    };

    const tokens = await this.generateTokenPair(payload);

    // Update session cache with new orgId
    await this.redis.setSession(userId, {
      sub: userId, email: user.email,
      orgId: membership.organizationId, role: membership.role,
      emailVerified: user.emailVerified,
      memberships: user.memberships.map((m) => ({ orgId: m.organizationId, role: m.role })),
    });

    return {
      ...tokens,
      currentOrganization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        type: membership.organization.type,
        role: membership.role,
      },
      organizations: user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        type: m.organization.type,
        role: m.role,
      })),
    };
  }

  async refresh(refreshToken: string, userAgent?: string, ipAddress?: string) {
    return this.rotateRefreshToken(refreshToken, userAgent, ipAddress);
  }

  async logout(refreshToken: string) {
    await this.revokeRefreshToken(refreshToken);
    return { message: 'Logged out successfully' };
  }

  async forgotPassword(email: string) {
    const user = await this.userService.findByEmail(email);
    if (user && !user.deletedAt) {
      const token = randomBytes(32).toString('hex');
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600000) },
      });
      console.log('token', token);
      await this.emailService.sendPasswordResetLink(email, token);
    }
    return { message: 'If an account exists with this email, a reset link has been sent to your email.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: { token: dto.token, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!resetToken) throw new NotFoundException('Invalid or expired reset token');

    const hash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: resetToken.userId }, data: { password: hash } }),
      this.prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    ]);
    await this.revokeAllUserTokens(resetToken.userId);
    return { message: 'Password reset successfully. Please log in with your new password.' };
  }

  // ─── INVITE ACCEPTANCE ───

  async getInviteByToken(token: string) {
    const invite = await this.prisma.teamInvite.findUnique({
      where: { token },
      include: { organization: { select: { id: true, name: true, slug: true, logo: true } } },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== InviteStatus.PENDING) throw new BadRequestException(`Invite has been ${invite.status.toLowerCase()}`);
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invite has expired');

    const userExists = !!(await this.userService.findByEmail(invite.email));
    return { email: invite.email, role: invite.role, organization: invite.organization, userExists };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    const invite = await this.prisma.teamInvite.findUnique({
      where: { token: dto.token },
      include: { organization: true },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== InviteStatus.PENDING) throw new BadRequestException(`Invite has been ${invite.status.toLowerCase()}`);
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invite has expired');

    let user = await this.userService.findByEmail(invite.email);
    if (!user) {
      if (!dto.password || !dto.firstName || !dto.lastName) {
        throw new BadRequestException('firstName, lastName, and password are required for new users');
      }
      user = await this.userService.create({
        email: invite.email, password: dto.password, firstName: dto.firstName, lastName: dto.lastName,
      });
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, emailVerifiedAt: new Date(), emailVerifyCode: null, emailVerifyExpires: null },
      });
    }

    await this.prisma.organizationMember.create({
      data: { organizationId: invite.organizationId, userId: user.id, role: invite.role },
    });
    await this.prisma.teamInvite.update({
      where: { id: invite.id },
      data: { status: InviteStatus.ACCEPTED, acceptedAt: new Date() },
    });

    // Invalidate session cache — stale orgId/memberships need to refresh
    await this.redis.deleteSession(user.id);

    const payload: JwtPayload = { sub: user.id, email: user.email, orgId: invite.organizationId, role: invite.role };
    const tokens = await this.generateTokenPair(payload);

    return {
      ...tokens,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      organization: { id: invite.organization.id, name: invite.organization.name, slug: invite.organization.slug },
    };
  }

  // ─── TOKEN MANAGEMENT ───

  async generateTokenPair(payload: JwtPayload): Promise<TokenPair> {
    const accessToken = this.jwt.sign(payload);
    const refreshToken = await this.createRefreshToken(payload.sub);
    return { accessToken, refreshToken };
  }

  async createRefreshToken(userId: string, userAgent?: string, ipAddress?: string): Promise<string> {
    const token = randomBytes(40).toString('hex');

    // Primary: Redis with auto-expiry TTL
    await this.redis.setRefreshToken(token, { userId, userAgent, ipAddress, createdAt: new Date().toISOString() });
    await this.redis.trackUserToken(userId, token);

    // Audit trail: DB (fire-and-forget, don't block)
    const expiresAt = this.calculateExpiry(this.refreshExpires);
    this.prisma.refreshToken.create({ data: { userId, token, userAgent, ipAddress, expiresAt } }).catch(() => { });

    return token;
  }

  async rotateRefreshToken(oldToken: string, userAgent?: string, ipAddress?: string): Promise<TokenPair> {
    // Look up in Redis (fast)
    const tokenData = await this.redis.getRefreshToken<{ userId: string }>(oldToken);
    if (!tokenData) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: tokenData.userId },
      include: { memberships: { where: { isActive: true }, take: 1 } },
    });
    if (!user || user.deletedAt) throw new UnauthorizedException('Account has been deactivated');

    // Revoke old token in Redis
    await this.redis.deleteRefreshToken(oldToken);

    // Audit trail (fire-and-forget)
    this.prisma.refreshToken.updateMany({ where: { token: oldToken, revokedAt: null }, data: { revokedAt: new Date() } }).catch(() => { });

    const membership = user.memberships[0];
    const payload: JwtPayload = {
      sub: user.id, email: user.email,
      orgId: membership?.organizationId, role: membership?.role,
    };

    const accessToken = this.jwt.sign(payload);
    const refreshToken = await this.createRefreshToken(user.id, userAgent, ipAddress);

    // Refresh session cache
    await this.redis.setSession(user.id, {
      sub: user.id, email: user.email,
      orgId: membership?.organizationId, role: membership?.role,
      emailVerified: user.emailVerified,
      memberships: user.memberships.map((m) => ({ orgId: m.organizationId, role: m.role })),
    });

    return { accessToken, refreshToken };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await this.redis.deleteRefreshToken(token);
    // Audit trail (fire-and-forget)
    this.prisma.refreshToken.updateMany({ where: { token, revokedAt: null }, data: { revokedAt: new Date() } }).catch(() => { });
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.redis.deleteAllUserTokens(userId);
    await this.redis.deleteSession(userId);
    // Audit trail (fire-and-forget)
    this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }).catch(() => { });
  }

  private calculateExpiry(duration: string): Date {
    const now = new Date();
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return new Date(now.getTime() + 7 * 86400000);
    const value = parseInt(match[1], 10);
    const ms = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]]!;
    return new Date(now.getTime() + value * ms);
  }
}