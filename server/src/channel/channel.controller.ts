import { BadRequestException, Controller, Post, Get, Patch, Delete, Body, Param, Query, Res, Req, Logger } from '@nestjs/common';
import type { Response, Request } from 'express';
import { ChannelPlatform, ChannelStatus, SyncStatus, UserRole } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SYNC_QUEUE, SyncJobData } from './sync.queue';

import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelService } from './channel.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ConnectShopifyDto } from './dto/connect-shopify.dto';
import { ManualConnectShopifyDto } from './dto/manual-connect-shopify.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { TriggerSyncDto } from './dto/trigger-sync.dto';
import { InstagramOAuthService } from './instagram-oauth.service';
import { WhatsAppOAuthService } from './whatsapp-oauth.service';
import { WhatsAppCallbackDto } from './dto/whatsapp-callback.dto';

@Controller('channels')
export class ChannelController {
  private readonly logger = new Logger(ChannelController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelService: ChannelService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly instagramOAuth: InstagramOAuthService,
    private readonly whatsappOAuth: WhatsAppOAuthService,
    @InjectQueue(SYNC_QUEUE) private readonly syncQueue: Queue,
  ) { }

  // POST /channels/shopify/install — start OAuth flow
  @Post('shopify/install')
  async installShopify(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConnectShopifyDto,
  ) {
    const authUrl = await this.shopifyOAuth.getInstallUrl(
      user.orgId!,
      user.sub,
      dto.shopDomain,
      dto.apiKey,
      dto.apiSecret,
    );
    return { authUrl };
  }

  // GET /channels/shopify/callback — Shopify redirects here after OAuth
  @Public()
  @Get('shopify/callback')
  async shopifyCallback(
    @Query() query: { code: string; hmac: string; shop: string; state: string; timestamp: string },
    @Res() res: Response,
  ) {
    const result = await this.shopifyOAuth.handleCallback(query);

    // Auto-trigger initial sync after successful connection
    try {
      await this.syncQueue.add('sync', {
        channelId: result.channelId,
        organizationId: result.organizationId,
        entityTypes: ['products', 'orders', 'customers', 'inventory'],
      } as SyncJobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });
    } catch (error) {
      // Non-fatal: sync can be triggered manually later
    }

    return res.redirect(result.redirectUrl);
  }

  // POST /channels/shopify/manual-connect — connect using manually created custom app credentials
  @Post('shopify/manual-connect')
  async manualConnectShopify(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ManualConnectShopifyDto,
  ) {
    const result = await this.shopifyOAuth.manualConnect(user.orgId!, dto.shopDomain, dto.apiKey, dto.apiSecret, dto.accessToken);

    // Auto-trigger initial sync after successful connection
    try {
      await this.syncQueue.add('sync', {
        channelId: result.channelId,
        organizationId: user.orgId!,
        entityTypes: ['products', 'orders', 'customers', 'inventory'],
      } satisfies SyncJobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      });
    } catch {
      // Non-fatal: sync can be triggered manually later
    }

    try {
      await this.shopifyOAuth.registerWebhooks(result.channelId);
    } catch {
      // Non-fatal: data still syncs via manual/scheduled sync
    }

    return result;
  }

  // POST /channels/instagram/install — start Meta OAuth flow
  @Post('instagram/install')
  async installInstagram(@CurrentUser() user: JwtPayload) {
    const authUrl = await this.instagramOAuth.getInstallUrl(user.orgId!, user.sub);
    return { authUrl };
  }

  // GET /channels/instagram/callback — Meta redirects here after OAuth
  @Public()
  @Get('instagram/callback')
  async instagramCallback(
    @Query() query: { code: string; state: string },
    @Res() res: Response,
  ) {
    const { redirectUrl } = await this.instagramOAuth.handleCallback(query);
    return res.redirect(redirectUrl);
  }

  // POST /channels/whatsapp/install — returns configId + state for the Meta JS SDK
  // (Embedded Signup runs in a popup launched by the frontend, not a browser redirect)
  @Post('whatsapp/install')
  async installWhatsApp(@CurrentUser() user: JwtPayload) {
    return this.whatsappOAuth.getSignupConfig(user.orgId!, user.sub);
  }

  // POST /channels/whatsapp/callback — frontend forwards the code returned by FB.login
  @Post('whatsapp/callback')
  async whatsappCallback(@Body() dto: WhatsAppCallbackDto) {
    return this.whatsappOAuth.handleSignupCallback(dto.code, dto.state);
  }

  // GET /channels — list org's channels
  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.channelService.findAllForOrg(user.orgId!);
  }

  // GET /channels/:id — get channel details + sync logs
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.channelService.findOne(id, user.orgId!);
  }

  // PATCH /channels/:id — update name or toggle
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.channelService.update(id, user.orgId!, user.sub, dto);
  }

  // DELETE /channels/:id — disconnect
  @Delete(':id')
  disconnect(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.channelService.disconnect(id, user.orgId!, user.sub);
  }

  // POST /channels/:id/sync — trigger manual sync
  //
  // Self-heals stuck channels: if a previous sync attempt crashed before
  // its `finally` block (e.g. credential resolution threw before runSync
  // entered its try/finally), the row can be pinned to IN_PROGRESS and the
  // UI button gets disabled forever. Before queueing a new job we always
  // reset the row to IDLE so the next attempt has a clean state. The
  // BullMQ queue handles concurrent runs separately — even if a real job
  // is still in flight, the reset is harmless: that job's `finally` will
  // overwrite the status when it finishes.
  @Post(':id/sync')
  async triggerSync(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: TriggerSyncDto,
  ) {
    const existing = await this.prisma.channel.findFirst({
      where: { id, organizationId: user.orgId! },
      select: { syncStatus: true, status: true, platform: true, name: true },
    });
    if (!existing) {
      throw new BadRequestException(`Channel ${id} not found`);
    }
    // Sync semantics by platform:
    //   SHOPIFY → pull from Shopify + bulk-push local unsynced items.
    //   MANUAL  → no pull source; runSync short-circuits the pull and just
    //             runs the bulk-push (products + orders + drafts). Useful
    //             when the user has auto-sync OFF and wants to push their
    //             CRM-side items to Shopify on demand.
    //   Anything else (INSTAGRAM, WHATSAPP) has no push or pull semantics
    //   for this sync queue — reject so the UI doesn't expose the affordance.
    if (
      existing.platform !== ChannelPlatform.SHOPIFY &&
      existing.platform !== ChannelPlatform.MANUAL
    ) {
      throw new BadRequestException(
        `Sync is not available for ${existing.platform} channels.`,
      );
    }
    if (existing.syncStatus === SyncStatus.IN_PROGRESS) {
      this.logger.warn(
        `Channel ${id} was IN_PROGRESS at sync trigger — resetting to IDLE before queueing a fresh job.`,
      );
      await this.prisma.channel.update({
        where: { id },
        data: {
          syncStatus: SyncStatus.IDLE,
          status: ChannelStatus.CONNECTED,
        },
      });
    }

    // Add job to BullMQ queue — returns immediately
    const job = await this.syncQueue.add('sync', {
      channelId: id,
      organizationId: user.orgId!,
      entityTypes: dto.entityTypes,
    } satisfies SyncJobData, {
      attempts: 3,                          // Retry up to 3 times
      backoff: { type: 'exponential', delay: 5000 },  // 5s, 10s, 20s
      removeOnComplete: { count: 100 },     // Keep last 100 completed jobs
      removeOnFail: { count: 50 },          // Keep last 50 failed jobs
    });

    return {
      message: 'Sync started',
      jobId: job.id,
      channelId: id,
      entityTypes: dto.entityTypes,
    };
  }

  // GET /channels/:id/sync-logs — list sync history
  @Get(':id/sync-logs')
  getSyncLogs(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.channelService.getSyncLogs(id, user.orgId!);
  }

  // POST /channels/:id/register-webhooks — re-run webhook registration for
  // an already-connected Shopify channel. Used when we add a new topic to
  // `WEBHOOK_TOPICS` (e.g. analytics cart/checkout events) — existing
  // channels need to re-register against Shopify or they'll silently miss
  // the new topics. Idempotent on Shopify's side: already-registered
  // topics return a "topic already registered" error which we swallow.
  @Post(':id/register-webhooks')
  async reRegisterWebhooks(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const channel = await this.prisma.channel.findFirst({
      where: {
        id,
        organizationId: user.orgId!,
        platform: ChannelPlatform.SHOPIFY,
      },
      select: { id: true },
    });
    if (!channel) {
      throw new BadRequestException(`Shopify channel ${id} not found`);
    }
    await this.shopifyOAuth.registerWebhooks(channel.id);
    return { ok: true };
  }
}