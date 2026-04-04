import { Controller, Post, Get, Patch, Delete, Body, Param, Query, Res, Req } from '@nestjs/common';
import type { Response, Request } from 'express';
import { UserRole } from '@prisma/client';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ChannelService } from './channel.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ConnectShopifyDto } from './dto/connect-shopify.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { TriggerSyncDto } from './dto/trigger-sync.dto';
import { InstagramOAuthService } from './instagram-oauth.service';

@Controller('channels')
export class ChannelController {
  constructor(
    private readonly channelService: ChannelService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly instagramOAuth: InstagramOAuthService,
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
    console.log("Hello", query);
    const { redirectUrl } = await this.shopifyOAuth.handleCallback(query);
    return res.redirect(redirectUrl);
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
    // TODO: Queue background sync job
    return { message: 'Sync started', channelId: id, entityTypes: dto.entityTypes };
  }

  // GET /channels/:id/sync-logs — list sync history
  @Get(':id/sync-logs')
  getSyncLogs(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.channelService.getSyncLogs(id, user.orgId!);
  }
}