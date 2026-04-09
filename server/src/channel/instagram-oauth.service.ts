import {
    Injectable,
    ConflictException,
    BadRequestException,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelPlatform, ChannelStatus, SyncStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { REDIS_TTL } from '../redis/redis.constants';
import { EncryptionService } from './encryption.service';

@Injectable()
export class InstagramOAuthService {
    private readonly logger = new Logger(InstagramOAuthService.name);
    private readonly appId: string;
    private readonly appSecret: string;
    private readonly appUrl: string;
    private readonly scopes: string;

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly encryption: EncryptionService,
        private readonly redis: RedisService,
    ) {
        this.appId = this.config.get<string>('instagram.appId')!;
        this.appSecret = this.config.get<string>('instagram.appSecret')!;
        this.appUrl = this.config.get<string>('appUrl')!;
        this.scopes = [
            'instagram_basic',
            'instagram_manage_messages',
            'pages_show_list',
            'pages_messaging',
            'pages_read_engagement',
            'instagram_manage_comments',
        ].join(',');
    }

    // Step 1: Generate the Facebook Login authorization URL
    async getInstallUrl(orgId: string, userId: string): Promise<string> {
        // Check if org already has an Instagram channel
        const existing = await this.prisma.channel.findUnique({
            where: { organizationId_platform: { organizationId: orgId, platform: ChannelPlatform.INSTAGRAM } },
        });
        if (existing) {
            throw new ConflictException('This organization already has an Instagram account connected');
        }

        // Generate CSRF state token — stored in Redis with 10-min TTL
        const state = randomBytes(16).toString('hex');
        await this.redis.set(`oauth:instagram:${state}`, { userId, orgId }, REDIS_TTL.OAUTH_STATE);

        const redirectUri = `${this.appUrl}/api/v1/channels/instagram/callback`;

        const authUrl =
            `https://www.facebook.com/v21.0/dialog/oauth` +
            `?client_id=${this.appId}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&scope=${this.scopes}` +
            `&state=${state}`;

        return authUrl;
    }

    // Step 2: Handle the Facebook OAuth callback
    async handleCallback(query: { code: string; state: string }): Promise<{ channelId: string; redirectUrl: string }> {
        // 1. Validate state from Redis (CSRF protection)
        const stateData = await this.redis.get<{ userId: string; orgId: string }>(`oauth:instagram:${query.state}`);
        if (!stateData) {
            throw new UnauthorizedException('Invalid or expired state parameter');
        }
        await this.redis.del(`oauth:instagram:${query.state}`);

        const redirectUri = `${this.appUrl}/api/v1/channels/instagram/callback`;

        // 2. Exchange code for short-lived token
        const tokenUrl =
            `https://graph.facebook.com/v21.0/oauth/access_token` +
            `?client_id=${this.appId}` +
            `&client_secret=${this.appSecret}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&code=${query.code}`;

        const tokenRes = await fetch(tokenUrl);
        if (!tokenRes.ok) {
            const error = await tokenRes.text();
            this.logger.error(`Meta token exchange failed: ${error}`);
            throw new BadRequestException('Failed to exchange authorization code');
        }
        const tokenData = (await tokenRes.json()) as { access_token: string; token_type: string; expires_in: number };

        // 3. Exchange for long-lived token (60 days)
        const longLivedUrl =
            `https://graph.facebook.com/v21.0/oauth/access_token` +
            `?grant_type=fb_exchange_token` +
            `&client_id=${this.appId}` +
            `&client_secret=${this.appSecret}` +
            `&fb_exchange_token=${tokenData.access_token}`;

        const longLivedRes = await fetch(longLivedUrl);
        if (!longLivedRes.ok) {
            const error = await longLivedRes.text();
            this.logger.error(`Long-lived token exchange failed: ${error}`);
            throw new BadRequestException('Failed to get long-lived token');
        }
        const longLivedData = (await longLivedRes.json()) as { access_token: string; token_type: string; expires_in: number };
        const longLivedToken = longLivedData.access_token;
        const tokenExpiresAt = new Date(Date.now() + longLivedData.expires_in * 1000);

        // 4. Get user's Facebook Pages
        const pagesRes = await fetch(
            `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}`,
        );
        const pagesData = (await pagesRes.json()) as { data: Array<{ id: string; name: string; access_token: string }> };

        if (!pagesData.data || pagesData.data.length === 0) {
            throw new BadRequestException('No Facebook Pages found. You need a Facebook Page to connect Instagram.');
        }

        // 5. Find Instagram Business Account on the first Page
        const page = pagesData.data[0];
        const igRes = await fetch(
            `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`,
        );
        const igData = (await igRes.json()) as { instagram_business_account?: { id: string } };

        if (!igData.instagram_business_account) {
            throw new BadRequestException(
                'No Instagram Business account found connected to your Facebook Page. ' +
                'Make sure your Instagram account is a Business or Creator account linked to a Facebook Page.',
            );
        }

        const igUserId = igData.instagram_business_account.id;

        // 6. Get Instagram profile info
        const profileRes = await fetch(
            `https://graph.facebook.com/v21.0/${igUserId}?fields=id,username,name,profile_picture_url&access_token=${longLivedToken}`,
        );
        const profileData = (await profileRes.json()) as { id: string; username: string; name: string; profile_picture_url?: string };

        // 7. Subscribe the Page to webhook events
        await fetch(
            `https://graph.facebook.com/v21.0/${page.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${page.access_token}`,
            { method: 'POST' },
        );

        // 8. Encrypt tokens and create Channel record
        const channel = await this.prisma.channel.create({
            data: {
                organizationId: stateData.orgId,
                name: profileData.username || profileData.name || 'Instagram',
                platform: ChannelPlatform.INSTAGRAM,
                status: ChannelStatus.CONNECTED,
                credentials: {
                    userAccessToken: this.encryption.encrypt(longLivedToken),
                    pageAccessToken: this.encryption.encrypt(page.access_token),
                    pageId: page.id,
                    pageName: page.name,
                    instagramUserId: igUserId,
                    instagramUsername: profileData.username,
                    profilePictureUrl: profileData.profile_picture_url,
                    tokenExpiresAt: tokenExpiresAt.toISOString(),
                    scopes: this.scopes,
                },
                externalStoreId: igUserId,
                externalStoreUrl: `https://instagram.com/${profileData.username}`,
                syncStatus: SyncStatus.IDLE,
            },
        });

        this.logger.log(`Instagram connected: @${profileData.username} → org ${stateData.orgId}`);

        const frontendUrl = this.config.get<string>('frontendUrl');
        const redirectUrl = `${frontendUrl}/channels?connected=instagram&channelId=${channel.id}`;

        return { channelId: channel.id, redirectUrl };
    }

    // Get decrypted access token for making Instagram API calls
    async getAccessToken(channelId: string): Promise<{ token: string; pageToken: string; igUserId: string }> {
        const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
        if (!channel || !channel.credentials) {
            throw new BadRequestException('Channel not found or missing credentials');
        }

        const creds = channel.credentials as {
            userAccessToken: string;
            pageAccessToken: string;
            instagramUserId: string;
            tokenExpiresAt: string;
        };

        // Check if token needs refresh (within 7 days of expiry)
        const expiresAt = new Date(creds.tokenExpiresAt);
        const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        if (expiresAt < sevenDaysFromNow) {
            await this.refreshToken(channelId, creds);
            // Re-read after refresh
            return this.getAccessToken(channelId);
        }

        return {
            token: this.encryption.decrypt(creds.userAccessToken),
            pageToken: this.encryption.decrypt(creds.pageAccessToken),
            igUserId: creds.instagramUserId,
        };
    }

    // Refresh long-lived token before it expires
    private async refreshToken(
        channelId: string,
        creds: { userAccessToken: string; tokenExpiresAt: string },
    ): Promise<void> {
        const currentToken = this.encryption.decrypt(creds.userAccessToken);

        const refreshUrl =
            `https://graph.facebook.com/v21.0/oauth/access_token` +
            `?grant_type=fb_exchange_token` +
            `&client_id=${this.appId}` +
            `&client_secret=${this.appSecret}` +
            `&fb_exchange_token=${currentToken}`;

        const res = await fetch(refreshUrl);
        if (!res.ok) {
            this.logger.error(`Instagram token refresh failed for channel ${channelId}`);
            await this.prisma.channel.update({
                where: { id: channelId },
                data: { status: ChannelStatus.ERROR },
            });
            throw new BadRequestException('Failed to refresh Instagram token');
        }

        const data = (await res.json()) as { access_token: string; expires_in: number };
        const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);

        // Re-fetch page access token with new user token
        const pagesRes = await fetch(
            `https://graph.facebook.com/v21.0/me/accounts?access_token=${data.access_token}`,
        );
        const pagesData = (await pagesRes.json()) as { data: Array<{ id: string; access_token: string }> };

        const existingChannel = await this.prisma.channel.findUnique({ where: { id: channelId } });
        const existingCreds = existingChannel?.credentials as Record<string, string | undefined>;
        const pageId = existingCreds?.pageId as string;
        const newPage = pagesData.data?.find((p) => p.id === pageId);

        await this.prisma.channel.update({
            where: { id: channelId },
            data: {
                credentials: {
                    ...existingCreds,
                    userAccessToken: this.encryption.encrypt(data.access_token),
                    pageAccessToken: newPage ? this.encryption.encrypt(newPage.access_token) : existingCreds.pageAccessToken,
                    tokenExpiresAt: newExpiresAt.toISOString(),
                },
                status: ChannelStatus.CONNECTED,
            },
        });

        this.logger.log(`Instagram token refreshed for channel ${channelId}, expires ${newExpiresAt.toISOString()}`);
    }
}