import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) { }

  async create(data: { email: string; password: string; firstName: string; lastName: string; avatarUrl?: string }) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(data.password, 12);
    const emailVerifyCode = Math.floor(100000 + Math.random() * 900000).toString();
    const emailVerifyExpires = new Date(Date.now() + 10 * 60 * 1000);

    return this.prisma.user.create({
      data: {
        email: data.email,
        password: passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        avatarUrl: data.avatarUrl,
        emailVerifyCode,
        emailVerifyExpires,
      },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByIdWithMemberships(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { memberships: { where: { isActive: true }, include: { organization: true } } },
    });
  }

  async update(id: string, data: { firstName?: string; lastName?: string; avatarUrl?: string }) {
    return this.prisma.user.update({ where: { id }, data });
  }

  async verifyEmail(userId: string, code: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, emailVerifyCode: code, emailVerifyExpires: { gt: new Date() }, emailVerified: false },
    });
    if (!user) throw new NotFoundException('Invalid or expired verification token');

    return this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifiedAt: new Date(), emailVerifyCode: null, emailVerifyExpires: null },
    });
  }

  async regenerateVerifyCode(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerified) return null;

    const emailVerifyCode = Math.floor(100000 + Math.random() * 900000).toString();
    const emailVerifyExpires = new Date(Date.now() + 10 * 60 * 1000);

    return this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifyCode, emailVerifyExpires },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) throw new ConflictException('Current password is incorrect');

    return this.prisma.user.update({
      where: { id: userId },
      data: { password: await bcrypt.hash(newPassword, 12) },
    });
  }

  async softDelete(id: string) {
    return this.prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}