import { Controller, Post, Get, Patch, Delete, Body, Param, Query, Res, Req } from '@nestjs/common';
import type { Response, Request } from 'express';
import { UserRole } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SYNC_QUEUE, SyncJobData } from './sync.queue';

import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ChannelService } from './channel.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ConnectShopifyDto } from './dto/connect-shopify.dto';
import { ManualConnectShopifyDto } from './dto/manual-connect-shopify.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { TriggerSyncDto } from './dto/trigger-sync.dto';
import { InstagramOAuthService } from './instagram-oauth.service';

@Controller('channels')
export class ChannelController {
  constructor(
    private readonly channelService: ChannelService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly instagramOAuth: InstagramOAuthService,
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
  @Post(':id/sync')
  async triggerSync(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: TriggerSyncDto,
  ) {
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
}