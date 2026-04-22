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

interface MetaTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

interface MetaDebugTokenResponse {
    data: {
        app_id: string;
        user_id: string;
        is_valid: boolean;
        granular_scopes?: Array<{
            scope: string;
            target_ids?: string[];
        }>;
    };
}

interface WabaPhoneNumber {
    id: string;
    display_phone_number: string;
    verified_name: string;
    code_verification_status?: string;
    quality_rating?: string;
}

@Injectable()
export class WhatsAppOAuthService {
    private readonly logger = new Logger(WhatsAppOAuthService.name);
    private readonly appId: string;
    private readonly appSecret: string;
    private readonly configId: string;
    private readonly graphVersion: string;
    private readonly frontendUrl: string;

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly encryption: EncryptionService,
        private readonly redis: RedisService,
    ) {
        this.appId = this.config.get<string>('whatsapp.appId')!;
        this.appSecret = this.config.get<string>('whatsapp.appSecret')!;
        this.configId = this.config.get<string>('whatsapp.configId')!;
        this.graphVersion = this.config.get<string>('whatsapp.graphVersion')!;
        this.frontendUrl = this.config.get<string>('frontendUrl')!;
    }

    private graphUrl(path: string): string {
        return `https://graph.facebook.com/${this.graphVersion}${path}`;
    }

    // Step 1: Hand the frontend the configId + a CSRF state to feed into FB.login
    async getSignupConfig(orgId: string, userId: string): Promise<{ configId: string; state: string }> {
        if (!this.configId) {
            throw new BadRequestException(
                'WhatsApp integration is not configured on the server. Missing WHATSAPP_CONFIG_ID.',
            );
        }

        const existing = await this.prisma.channel.findUnique({
            where: { organizationId_platform: { organizationId: orgId, platform: ChannelPlatform.WHATSAPP } },
        });
        if (existing) {
            throw new ConflictException('This organization already has a WhatsApp Business account connected');
        }

        const state = randomBytes(16).toString('hex');
        await this.redis.set(`oauth:whatsapp:${state}`, { userId, orgId }, REDIS_TTL.OAUTH_STATE);

        return { configId: this.configId, state };
    }

    // Step 2: Frontend calls this with the `code` Meta's popup returned.
    async handleSignupCallback(
        code: string,
        state: string,
    ): Promise<{ channelId: string; redirectUrl: string }> {
        // 1. Validate CSRF state
        const stateData = await this.redis.get<{ userId: string; orgId: string }>(
            `oauth:whatsapp:${state}`,
        );
        if (!stateData) {
            throw new UnauthorizedException('Invalid or expired state parameter');
        }
        await this.redis.del(`oauth:whatsapp:${state}`);

        // 2. Exchange the short-lived code for an access token.
        const tokenUrl =
            this.graphUrl('/oauth/access_token') +
            `?client_id=${this.appId}` +
            `&client_secret=${this.appSecret}` +
            `&code=${encodeURIComponent(code)}`;
        const tokenRes = await fetch(tokenUrl);
        if (!tokenRes.ok) {
            const errorBody = await tokenRes.text();
            this.logger.error(`WhatsApp token exchange failed: ${errorBody}`);
            throw new BadRequestException('Failed to exchange authorization code');
        }
        const tokenData = (await tokenRes.json()) as MetaTokenResponse;

        // 3. Upgrade to a long-lived token (~60 days).
        const longLivedUrl =
            this.graphUrl('/oauth/access_token') +
            `?grant_type=fb_exchange_token` +
            `&client_id=${this.appId}` +
            `&client_secret=${this.appSecret}` +
            `&fb_exchange_token=${tokenData.access_token}`;
        const longLivedRes = await fetch(longLivedUrl);
        if (!longLivedRes.ok) {
            const errorBody = await longLivedRes.text();
            this.logger.error(`WhatsApp long-lived token exchange failed: ${errorBody}`);
            throw new BadRequestException('Failed to get long-lived token');
        }
        const longLivedData = (await longLivedRes.json()) as MetaTokenResponse;
        const longLivedToken = longLivedData.access_token;
        const tokenExpiresAt = longLivedData.expires_in
            ? new Date(Date.now() + longLivedData.expires_in * 1000)
            : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

        // 4. Inspect the token to find which WABA(s) the merchant authorized.
        const debugUrl =
            this.graphUrl('/debug_token') +
            `?input_token=${longLivedToken}` +
            `&access_token=${this.appId}|${this.appSecret}`;
        const debugRes = await fetch(debugUrl);
        if (!debugRes.ok) {
            const errorBody = await debugRes.text();
            this.logger.error(`WhatsApp debug_token failed: ${errorBody}`);
            throw new BadRequestException('Failed to inspect access token');
        }
        const debugData = (await debugRes.json()) as MetaDebugTokenResponse;

        const wabaId = this.extractWabaId(debugData);
        if (!wabaId) {
            throw new BadRequestException(
                'No WhatsApp Business Account granted. Please retry and select a WABA in the popup.',
            );
        }

        // 5. Fetch display metadata for the WABA (name, business owner).
        let wabaName: string | undefined;
        let businessId: string | undefined;
        try {
            const wabaRes = await fetch(
                this.graphUrl(`/${wabaId}`) +
                    `?fields=id,name,owner_business_info&access_token=${longLivedToken}`,
            );
            if (wabaRes.ok) {
                const wabaData = (await wabaRes.json()) as {
                    id: string;
                    name?: string;
                    owner_business_info?: { id?: string; name?: string };
                };
                wabaName = wabaData.name;
                businessId = wabaData.owner_business_info?.id;
            }
        } catch (err) {
            this.logger.warn(`Non-fatal: could not fetch WABA metadata for ${wabaId}`);
        }

        // 6. Fetch the phone number(s) registered on this WABA — take the first.
        const phonesRes = await fetch(
            this.graphUrl(`/${wabaId}/phone_numbers`) +
                `?access_token=${longLivedToken}`,
        );
        if (!phonesRes.ok) {
            const errorBody = await phonesRes.text();
            this.logger.error(`WhatsApp phone_numbers fetch failed: ${errorBody}`);
            throw new BadRequestException('Failed to fetch phone numbers for the WABA');
        }
        const phonesData = (await phonesRes.json()) as { data?: WabaPhoneNumber[] };
        const phoneNumber = phonesData.data?.[0];
        if (!phoneNumber) {
            throw new BadRequestException(
                'No phone number found on this WhatsApp Business Account. Please add one in WhatsApp Manager first.',
            );
        }

        // 7. Persist the Channel row with encrypted token.
        const channel = await this.prisma.channel.create({
            data: {
                organizationId: stateData.orgId,
                name: phoneNumber.verified_name || phoneNumber.display_phone_number || wabaName || 'WhatsApp',
                platform: ChannelPlatform.WHATSAPP,
                status: ChannelStatus.CONNECTED,
                credentials: {
                    wabaId,
                    wabaName,
                    businessId,
                    phoneNumberId: phoneNumber.id,
                    displayPhoneNumber: phoneNumber.display_phone_number,
                    verifiedName: phoneNumber.verified_name,
                    codeVerificationStatus: phoneNumber.code_verification_status,
                    qualityRating: phoneNumber.quality_rating,
                    accessToken: this.encryption.encrypt(longLivedToken),
                    tokenExpiresAt: tokenExpiresAt.toISOString(),
                    scopes: 'whatsapp_business_management,whatsapp_business_messaging',
                    connectedAt: new Date().toISOString(),
                },
                externalStoreId: wabaId,
                syncStatus: SyncStatus.IDLE,
            },
        });

        this.logger.log(
            `WhatsApp connected: WABA ${wabaId} (${phoneNumber.verified_name || phoneNumber.display_phone_number}) → org ${stateData.orgId}`,
        );

        const redirectUrl = `${this.frontendUrl}/app/channel?connected=whatsapp&channelId=${channel.id}`;

        return { channelId: channel.id, redirectUrl };
    }

    // Pull the first WABA ID out of debug_token's granular_scopes.
    private extractWabaId(debug: MetaDebugTokenResponse): string | undefined {
        const scopes = debug.data.granular_scopes ?? [];
        const wabaScope = scopes.find((s) =>
            ['whatsapp_business_management', 'whatsapp_business_messaging'].includes(s.scope),
        );
        return wabaScope?.target_ids?.[0];
    }
}
