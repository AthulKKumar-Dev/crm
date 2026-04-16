import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ChannelPlatform, ChannelStatus, UserRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Injectable()
export class ChannelService {
  constructor(private readonly prisma: PrismaService, private readonly shopifyOAuth: ShopifyOAuthService) { }

  async findAllForOrg(orgId: string) {
    return this.prisma.channel.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        platform: true,
        status: true,
        isEnabled: true,
        externalStoreUrl: true,
        lastSyncedAt: true,
        syncStatus: true,
        createdAt: true,
      },
    });
  }

  async findOne(channelId: string, orgId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId: orgId },
      include: {
        syncLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            status: true,
            entityType: true,
            recordsProcessed: true,
            recordsFailed: true,
            totalEstimated: true,
            errorMessage: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    // Don't expose credentials in the response
    const { credentials, ...safeChannel } = channel;
    return safeChannel;
  }

  async update(channelId: string, orgId: string, userId: string, dto: UpdateChannelDto) {
    await this.requireOrgRole(orgId, userId, [UserRole.OWNER, UserRole.ADMIN]);

    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId: orgId },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    return this.prisma.channel.update({
      where: { id: channelId },
      data: dto,
    });
  }

  async disconnect(channelId: string, orgId: string, userId: string) {
    await this.requireOrgRole(orgId, userId, [UserRole.OWNER, UserRole.ADMIN]);

    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId: orgId },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    // Unregister webhooks before clearing credentials
    if (channel.platform === ChannelPlatform.SHOPIFY && channel.credentials) {
      try {
        await this.shopifyOAuth.unregisterWebhooks(channelId);
      } catch {
        // Best-effort: credentials may already be invalid
      }

      await this.prisma.channel.update({
        where: { id: channelId },
        data: { status: ChannelStatus.DISCONNECTED, credentials: Prisma.JsonNull },
      });

      return { message: 'Channel disconnected' };
    }
  }

  async getSyncLogs(channelId: string, orgId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId: orgId },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    return this.prisma.syncLog.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private async requireOrgRole(orgId: string, userId: string, roles: UserRole[]) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
    });
    if (!membership || !membership.isActive || !roles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }
}