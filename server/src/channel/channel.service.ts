import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ChannelPlatform, ChannelStatus, SyncStatus, UserRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Injectable()
export class ChannelService {
  constructor(private readonly prisma: PrismaService, private readonly shopifyOAuth: ShopifyOAuthService) { }

  async findAllForOrg(orgId: string) {
    // Auto-heal MANUAL channels stuck in ERROR / SYNCING / IN_PROGRESS state.
    // MANUAL channels have no remote to sync with, so any non-CONNECTED state
    // is stale (left over from misrouted sync jobs). Without this the UI
    // shows a red "Error" badge that the user can't clear because the Sync
    // button is correctly hidden for MANUAL channels.
    await this.prisma.channel.updateMany({
      where: {
        organizationId: orgId,
        platform: ChannelPlatform.MANUAL,
        OR: [
          { status: { not: ChannelStatus.CONNECTED } },
          { syncStatus: { not: SyncStatus.IDLE } },
        ],
      },
      data: {
        status: ChannelStatus.CONNECTED,
        syncStatus: SyncStatus.IDLE,
      },
    });

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

    // Don't expose credentials in the response — but do report whether the
    // grant inside them still covers what the app needs. Additive field; no
    // existing property changes shape.
    const { credentials, ...safeChannel } = channel;
    return {
      ...safeChannel,
      scopeStatus:
        channel.platform === ChannelPlatform.SHOPIFY
          ? this.shopifyOAuth.describeScopeStatus(credentials)
          : { known: true, missing: [], reconnectRequired: false },
    };
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
        data: {
          status: ChannelStatus.DISCONNECTED,
          credentials: Prisma.JsonNull,
          // Release the store claim: (platform, externalStoreId) is globally
          // unique, so keeping the ids here would block every other
          // organization from ever connecting this store.
          externalStoreId: null,
          externalStoreUrl: null,
        },
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