import {
    Injectable,
    ConflictException,
    BadRequestException,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelPlatform, ChannelStatus, SyncStatus } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';

@Injectable()
export class ShopifyOAuthService {
    private readonly logger = new Logger(ShopifyOAuthService.name);
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly scopes: string;
    private readonly appUrl: string;

    // In-memory store for OAuth state (use Redis in production)
    private readonly stateStore = new Map<string, { userId: string; orgId: string; shopDomain: string }>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly encryption: EncryptionService,
    ) {
        this.clientId = this.config.get<string>('shopify.clientId')!;
        this.clientSecret = this.config.get<string>('shopify.clientSecret')!;
        this.scopes = 'read_products,read_orders,read_customers,read_inventory,read_locations';
        this.appUrl = this.config.get<string>('appUrl')!;
    }

    // Step 1: Generate the Shopify authorization URL
    async getInstallUrl(orgId: string, userId: string, shopDomain: string): Promise<string> {
        // Check if org already has a Shopify channel
        const existing = await this.prisma.channel.findUnique({
            where: { organizationId_platform: { organizationId: orgId, platform: ChannelPlatform.SHOPIFY } },
        });
        if (existing) {
            throw new ConflictException('This organization already has a Shopify store connected');
        }

        // Generate CSRF state token
        const state = randomBytes(16).toString('hex');
        this.stateStore.set(state, { userId, orgId, shopDomain });

        // Auto-expire state after 10 minutes
        setTimeout(() => this.stateStore.delete(state), 10 * 60 * 1000);

        const redirectUri = `${this.appUrl}/api/v1/channels/shopify/callback`;

        const authUrl =
            `https://${shopDomain}/admin/oauth/authorize` +
            `?client_id=${this.clientId}` +
            `&scope=${this.scopes}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&state=${state}`;

        return authUrl;
    }

    // Step 2: Handle the OAuth callback from Shopify
    async handleCallback(query: {
        code: string;
        hmac: string;
        shop: string;
        state: string;
        timestamp: string;
    }): Promise<{ channelId: string; redirectUrl: string }> {
        // 1. Validate state (CSRF protection)
        const stateData = this.stateStore.get(query.state);
        if (!stateData) {
            throw new UnauthorizedException('Invalid or expired state parameter');
        }
        this.stateStore.delete(query.state);

        // 2. Validate HMAC (verify request is from Shopify)
        this.verifyHmac(query);

        // 3. Validate shop domain matches
        if (query.shop !== stateData.shopDomain) {
            throw new BadRequestException('Shop domain mismatch');
        }

        // 4. Exchange authorization code for access token
        const tokenResponse = await fetch(
            `https://${query.shop}/admin/oauth/access_token`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    code: query.code,
                }),
            },
        );

        if (!tokenResponse.ok) {
            const error = await tokenResponse.text();
            this.logger.error(`Shopify token exchange failed: ${error}`);
            throw new BadRequestException('Failed to exchange authorization code');
        }

        const tokenData = (await tokenResponse.json()) as {
            access_token: string;
            scope: string;
        };

        // 5. Get shop info to get the shop ID
        const shopResponse = await fetch(
            `https://${query.shop}/admin/api/2024-01/shop.json`,
            { headers: { 'X-Shopify-Access-Token': tokenData.access_token } },
        );
        const shopData = (await shopResponse.json()) as { shop: { id: number; name: string } };

        // 6. Encrypt and store the access token
        const encryptedToken = this.encryption.encrypt(tokenData.access_token);

        const channel = await this.prisma.channel.create({
            data: {
                organizationId: stateData.orgId,
                name: shopData.shop.name || query.shop,
                platform: ChannelPlatform.SHOPIFY,
                status: ChannelStatus.CONNECTED,
                credentials: {
                    accessToken: encryptedToken,
                    shopDomain: query.shop,
                    scopes: tokenData.scope,
                },
                externalStoreId: String(shopData.shop.id),
                externalStoreUrl: `https://${query.shop}`,
                syncStatus: SyncStatus.IDLE,
            },
        });

        this.logger.log(`Shopify store connected: ${query.shop} → org ${stateData.orgId}`);

        // 7. Redirect URL for the frontend
        const frontendUrl = this.config.get<string>('frontendUrl');
        const redirectUrl = `${frontendUrl}/channels?connected=shopify&channelId=${channel.id}`;

        return { channelId: channel.id, redirectUrl };
    }

    // Get decrypted access token for making API calls
    async getAccessToken(channelId: string): Promise<{ token: string; shopDomain: string }> {
        const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
        if (!channel || !channel.credentials) {
            throw new BadRequestException('Channel not found or missing credentials');
        }

        const creds = channel.credentials as { accessToken: string; shopDomain: string };
        const token = this.encryption.decrypt(creds.accessToken);

        return { token, shopDomain: creds.shopDomain };
    }

    // Verify Shopify HMAC signature
    private verifyHmac(query: Record<string, string>): void {
        const { hmac, ...params } = query;
        const sortedParams = Object.keys(params)
            .sort()
            .map((key) => `${key}=${params[key]}`)
            .join('&');

        const generatedHmac = createHmac('sha256', this.clientSecret)
            .update(sortedParams)
            .digest('hex');

        const hmacBuffer = Buffer.from(hmac, 'hex');
        const generatedBuffer = Buffer.from(generatedHmac, 'hex');

        if (hmacBuffer.length !== generatedBuffer.length || !timingSafeEqual(hmacBuffer, generatedBuffer)) {
            throw new UnauthorizedException('Invalid HMAC signature');
        }
    }
}