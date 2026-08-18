import {
  BadRequestException,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ChannelPlatform, ChannelStatus, SyncStatus, UserRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { UpdateSyncSettingsDto } from './dto/update-sync-settings.dto';
import {
  PULL_ENTITY_TYPES,
  PUSH_ENTITY_TYPES,
} from './shopify-sync.service';

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

  // ─── PER-ENTITY SYNC SETTINGS ───
  //
  // The enforcement side already lives in ShopifySyncService.enabledEntities;
  // this is the read/write API behind it. Both sides share one rule:
  // **enabled unless a row says otherwise**. That keeps channels which predate
  // the toggles -- and any entity a merchant has never touched -- behaving
  // exactly as they do today with no rows seeded for them.

  /**
   * How many local records the PUSH direction would send RIGHT NOW.
   *
   * Surfaced next to the push toggles because `bulkPushUnsyncedOrders` sends
   * EVERY manual order never marked SYNCED -- potentially a long backlog -- and
   * each becomes a real order in the merchant's Shopify admin via
   * `orderCreate`. A Shopify order cannot be un-created, so the number has to
   * be visible BEFORE the merchant ticks the box, not discovered afterwards.
   *
   * Drafts are deliberately absent: they do not carry the
   * `metadata.shopifySync` marker, so any count here would be invented rather
   * than derived.
   */
  private async pendingPushCounts(orgId: string) {
    const manual = await this.prisma.channel.findFirst({
      where: { organizationId: orgId, platform: ChannelPlatform.MANUAL },
      select: { id: true },
    });
    if (!manual) return { orders: 0, products: 0 };

    // Raw SQL, not a Prisma JSON filter, and deliberately so.
    //
    // `NOT: { metadata: { path: [...], equals: 'SYNCED' } }` compiles to
    // NOT (metadata #>> '{shopifySync,status}' = 'SYNCED'). For a row whose
    // metadata is NULL — or which simply has no shopifySync key — the inner
    // comparison is NULL, NOT NULL is NULL, and the row is EXCLUDED. Those
    // are precisely the never-pushed records this count exists to warn about,
    // so the filter would report 0 for the most dangerous case. `coalesce`
    // collapses both to the empty string and compares cleanly.
    //
    // Mirrors ShopifyPushService.isAlreadySynced: only the exact string
    // 'SYNCED' counts as done, so a FAILED or absent marker is still pending.
    const countPending = async (table: 'orders' | 'products') => {
      const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) AS count
        FROM ${Prisma.raw(`"${table}"`)} t
        WHERE t.organization_id = ${orgId}
          AND t.channel_id = ${manual.id}
          AND t.deleted_at IS NULL
          AND coalesce(t.metadata->'shopifySync'->>'status', '') <> 'SYNCED'
      `;
      return Number(rows[0]?.count ?? 0);
    };

    const [orders, products] = await Promise.all([
      countPending('orders'),
      countPending('products'),
    ]);
    return { orders, products };
  }

  async getSyncSettings(channelId: string, orgId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId: orgId },
      select: { id: true, platform: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    const rows = await this.prisma.channelSyncState.findMany({
      where: { channelId },
      select: {
        direction: true,
        entityType: true,
        enabled: true,
        watermark: true,
        backfillDone: true,
      },
    });

    const describe = (direction: 'pull' | 'push', entityType: string) => {
      const row = rows.find(
        (r) => r.direction === direction && r.entityType === entityType,
      );
      return {
        entityType,
        // Absent row => enabled. Only an explicit `false` turns something off.
        enabled: row?.enabled ?? true,
        backfillDone: row?.backfillDone ?? false,
        watermark: row?.watermark ?? null,
      };
    };

    return {
      channelId: channel.id,
      platform: channel.platform,
      pull: PULL_ENTITY_TYPES.map((e) => describe('pull', e)),
      push: PUSH_ENTITY_TYPES.map((e) => describe('push', e)),
      pendingPush: await this.pendingPushCounts(orgId),
    };
  }

  async updateSyncSettings(
    channelId: string,
    orgId: string,
    dto: UpdateSyncSettingsDto,
  ) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId: orgId },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (dto.pull.length === 0 && dto.push.length === 0) {
      throw new BadRequestException(
        'Select at least one thing to sync, or disconnect the channel instead.',
      );
    }

    // A row is written for EVERY entity in both directions, not just the
    // enabled ones, so the stored state is self-describing rather than
    // something you have to diff against a hard-coded list to interpret.
    const writes = [
      ...PULL_ENTITY_TYPES.map((entityType) => ({
        direction: 'pull',
        entityType,
        enabled: dto.pull.includes(entityType),
      })),
      ...PUSH_ENTITY_TYPES.map((entityType) => ({
        direction: 'push',
        entityType,
        enabled: dto.push.includes(entityType),
      })),
    ];

    await this.prisma.$transaction(
      writes.map((w) =>
        this.prisma.channelSyncState.upsert({
          where: {
            channelId_direction_entityType: {
              channelId,
              direction: w.direction,
              entityType: w.entityType,
            },
          },
          create: { channelId, ...w },
          // ONLY the toggle. `watermark` and `backfillDone` are the sync's own
          // bookkeeping and must survive a settings change -- otherwise turning
          // an entity off and on again would force a full re-backfill.
          update: { enabled: w.enabled },
        }),
      ),
    );

    return this.getSyncSettings(channelId, orgId);
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