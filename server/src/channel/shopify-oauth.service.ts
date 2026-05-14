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
import { RedisService } from '../redis/redis.service';
import { REDIS_TTL } from '../redis/redis.constants';
import { EncryptionService } from './encryption.service';
import { ShopifyPushEnqueuer } from './shopify-push.enqueuer';

@Injectable()
export class ShopifyOAuthService {
    private readonly logger = new Logger(ShopifyOAuthService.name);
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly scopes: string;
    private readonly appUrl: string;
    private readonly apiVersion: string;

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly encryption: EncryptionService,
        private readonly redis: RedisService,
        private readonly shopifyPushEnqueuer: ShopifyPushEnqueuer,
    ) {
        this.clientId = this.config.get<string>('shopify.clientId')!;
        this.clientSecret = this.config.get<string>('shopify.clientSecret')!;
        // Both read AND write scopes — write_* are needed because the CRM
        // now pushes data INTO Shopify (orders from the offline-order flow,
        // products created in the CRM, inventory levels for new products).
        // Existing tokens are pinned to the scopes they were issued with;
        // merchants must re-grant on the custom-app side or reconnect.
        this.scopes = [
            'read_products', 'write_products',
            'read_orders', 'write_orders', 'read_all_orders',
            'read_customers',
            'read_inventory', 'write_inventory',
            'read_locations',
        ].join(',');
        this.appUrl = this.config.get<string>('appUrl')!;
        this.apiVersion = this.config.get<string>('shopify.apiVersion') ?? '2026-01';
    }

    // ─── CUSTOM APP OAUTH ───
    // Merchant creates a custom app in their Shopify Admin, enters API key + secret in CRM,
    // then gets redirected to Shopify to install the app and grant permissions.
    // After install, Shopify redirects back with a code that we exchange for an access token
    // using the merchant's own API key/secret.

    // Step 1: Generate the Shopify authorization URL using merchant's own API key
    async getInstallUrl(orgId: string, userId: string, shopDomain: string, apiKey?: string, apiSecret?: string): Promise<string> {
        const existing = await this.prisma.channel.findUnique({
            where: { organizationId_platform: { organizationId: orgId, platform: ChannelPlatform.SHOPIFY } },
        });
        if (existing) {
            throw new ConflictException('This organization already has a Shopify store connected');
        }

        // Use merchant's API key if provided, otherwise fall back to platform-level credentials
        const clientId = apiKey || this.clientId;
        const clientSecret = apiSecret || this.clientSecret;

        // Store state in Redis with merchant's credentials for the callback
        const state = randomBytes(16).toString('hex');
        await this.redis.set(`oauth:shopify:${state}`, {
            userId, orgId, shopDomain, clientId, clientSecret,
        }, REDIS_TTL.OAUTH_STATE);

        const redirectUri = `${this.appUrl}/api/v1/channels/shopify/callback`;

        const authUrl =
            `https://${shopDomain}/admin/oauth/authorize` +
            `?client_id=${clientId}` +
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
    }): Promise<{ channelId: string; organizationId: string; redirectUrl: string }> {
        // 1. Validate state from Redis
        const stateData = await this.redis.get<{
            userId: string; orgId: string; shopDomain: string;
            clientId: string; clientSecret: string;
        }>(`oauth:shopify:${query.state}`);
        if (!stateData) {
            throw new UnauthorizedException('Invalid or expired state parameter');
        }
        await this.redis.del(`oauth:shopify:${query.state}`);

        // 2. Validate HMAC using the merchant's API secret (stored in state)
        this.verifyHmacWithSecret(query, stateData.clientSecret);

        // 3. Validate shop domain matches
        if (query.shop !== stateData.shopDomain) {
            throw new BadRequestException('Shop domain mismatch');
        }

        // 4. Exchange code for access token using merchant's credentials
        const tokenResponse = await fetch(
            `https://${query.shop}/admin/oauth/access_token`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: stateData.clientId,
                    client_secret: stateData.clientSecret,
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

        // 5. Get shop info
        const shopResponse = await fetch(
            `https://${query.shop}/admin/api/${this.apiVersion}/shop.json`,
            { headers: { 'X-Shopify-Access-Token': tokenData.access_token } },
        );
        const shopData = (await shopResponse.json()) as {
            shop: { id: number; name: string; currency: string; iana_timezone?: string };
        };

        // 6. Encrypt and store all credentials
        const encryptedToken = this.encryption.encrypt(tokenData.access_token);
        const encryptedApiKey = this.encryption.encrypt(stateData.clientId);
        const encryptedApiSecret = this.encryption.encrypt(stateData.clientSecret);

        // 7. Create Channel + update Organization currency atomically.
        // The Shopify shop is the source of truth for the org's currency — merchants
        // sell in whatever currency their storefront is set to, so we inherit it here
        // instead of asking during onboarding. Only updates if Shopify returned a
        // non-empty currency; otherwise leaves the existing org currency alone.
        const [channel] = await this.prisma.$transaction([
            this.prisma.channel.create({
                data: {
                    organizationId: stateData.orgId,
                    name: shopData.shop.name || query.shop,
                    platform: ChannelPlatform.SHOPIFY,
                    status: ChannelStatus.CONNECTED,
                    isEnabled: true,
                    credentials: {
                        accessToken: encryptedToken,
                        apiKey: encryptedApiKey,
                        apiSecret: encryptedApiSecret,
                        shopDomain: query.shop,
                        scopes: tokenData.scope,
                    },
                    externalStoreId: String(shopData.shop.id),
                    externalStoreUrl: `https://${query.shop}`,
                    syncStatus: SyncStatus.IDLE,
                },
            }),
            ...(shopData.shop.currency
                ? [
                    this.prisma.organization.update({
                        where: { id: stateData.orgId },
                        data: { currency: shopData.shop.currency },
                    }),
                ]
                : []),
        ]);

        this.logger.log(
            `Shopify store connected via OAuth: ${query.shop} → org ${stateData.orgId} ` +
            `(currency: ${shopData.shop.currency ?? 'unchanged'})`,
        );

        // Removed: automatic bulk-push of CRM-only products on Shopify connect.
        // Merchants now decide what crosses the line — they can push individual
        // items via the per-row Sync action, or run a one-click bulk push from
        // the Channels page Sync button (which now also pushes unsynced data).

        const frontendUrl = this.config.get<string>('frontendUrl');
        const redirectUrl = `${frontendUrl}/channel?connected=shopify&channelId=${channel.id}`;

        return { channelId: channel.id, organizationId: stateData.orgId, redirectUrl };
    }

    // ─── MANUAL CONNECT ───
    // For merchants who create a custom app in their Shopify Admin and provide credentials.
    // Each merchant has their own custom app — no shared Partners app needed.
    async manualConnect(orgId: string, shopDomain: string, apiKey: string, apiSecret: string, accessToken: string) {
        // Check if org already has a Shopify channel
        const existing = await this.prisma.channel.findUnique({
            where: { organizationId_platform: { organizationId: orgId, platform: ChannelPlatform.SHOPIFY } },
        });
        if (existing) {
            throw new ConflictException('A Shopify store is already connected. Disconnect it first.');
        }

        // Validate the token by fetching shop info
        let shopData: any;
        try {
            const res = await fetch(`https://${shopDomain}/admin/api/${this.apiVersion}/shop.json`, {
                headers: { 'X-Shopify-Access-Token': accessToken },
            });
            if (!res.ok) {
                const errorText = await res.text();
                this.logger.error(`Shopify API error: ${res.status} ${errorText}`);
                throw new BadRequestException(
                    'Invalid credentials. Please check your store URL and access token.',
                );
            }
            shopData = await res.json();
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            this.logger.error('Failed to connect to Shopify', error);
            throw new BadRequestException(
                'Could not connect to Shopify. Please verify your store URL and credentials.',
            );
        }

        // Encrypt sensitive credentials before storing
        const encryptedToken = this.encryption.encrypt(accessToken);
        const encryptedApiKey = this.encryption.encrypt(apiKey);
        const encryptedApiSecret = this.encryption.encrypt(apiSecret);

        // Create Channel + update Organization currency atomically.
        // Same rationale as the OAuth flow: the Shopify shop's currency is the
        // source of truth for the org's currency.
        const [channel] = await this.prisma.$transaction([
            this.prisma.channel.create({
                data: {
                    organizationId: orgId,
                    name: shopData.shop.name || shopDomain,
                    platform: ChannelPlatform.SHOPIFY,
                    status: ChannelStatus.CONNECTED,
                    isEnabled: true,
                    credentials: {
                        accessToken: encryptedToken,
                        apiKey: encryptedApiKey,
                        apiSecret: encryptedApiSecret,
                        shopDomain,
                        scopes: 'custom_app',
                    },
                    externalStoreId: String(shopData.shop.id),
                    externalStoreUrl: `https://${shopDomain}`,
                    syncStatus: SyncStatus.IDLE,
                },
            }),
            ...(shopData.shop.currency
                ? [
                    this.prisma.organization.update({
                        where: { id: orgId },
                        data: { currency: shopData.shop.currency },
                    }),
                ]
                : []),
        ]);

        this.logger.log(
            `Shopify store connected (custom app): ${shopDomain} → org ${orgId} ` +
            `(currency: ${shopData.shop.currency ?? 'unchanged'})`,
        );

        // Removed: automatic bulk-push of CRM-only products on Shopify connect.
        // See note in the OAuth callback flow above — merchants now opt in.

        return {
            channelId: channel.id,
            shopName: shopData.shop.name,
            shopDomain,
        };
    }

    // Get decrypted access token for making API calls.
    //
    // Strict on platform — only SHOPIFY channels carry credentials. Calling this
    // on a MANUAL / INSTAGRAM / WHATSAPP channel is a caller bug (e.g. someone
    // enqueued a Shopify sync job for the wrong channel id); fail fast with a
    // clear message so the caller can be fixed, instead of silently flipping
    // unrelated channels to DISCONNECTED.
    async getAccessToken(channelId: string): Promise<{ token: string; shopDomain: string }> {
        const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
        if (!channel) {
            throw new BadRequestException(`Channel ${channelId} not found`);
        }
        if (channel.platform !== ChannelPlatform.SHOPIFY) {
            throw new BadRequestException(
                `Channel "${channel.name}" is on platform ${channel.platform}, not SHOPIFY. ` +
                `Shopify-only operations cannot run against it.`,
            );
        }
        if (!channel.credentials) {
            // Genuinely broken state for a Shopify channel — flip to DISCONNECTED
            // so the UI surfaces a "Reconnect" affordance instead of looping retries.
            if (channel.status !== ChannelStatus.DISCONNECTED) {
                await this.prisma.channel.update({
                    where: { id: channelId },
                    data: { status: ChannelStatus.DISCONNECTED },
                });
            }
            throw new BadRequestException(
                `Shopify channel "${channel.name}" has no stored credentials. ` +
                `Reconnect the store from Settings → Channels to restore sync.`,
            );
        }

        const creds = channel.credentials as { accessToken: string; shopDomain: string };
        const token = this.encryption.decrypt(creds.accessToken);

        return { token, shopDomain: creds.shopDomain };
    }

    // Verify Shopify HMAC signature using a specific secret
    private verifyHmacWithSecret(query: Record<string, string>, secret: string): void {
        const { hmac, ...params } = query;
        const sortedParams = Object.keys(params)
            .sort()
            .map((key) => `${key}=${params[key]}`)
            .join('&');

        const generatedHmac = createHmac('sha256', secret)
            .update(sortedParams)
            .digest('hex');

        const hmacBuffer = Buffer.from(hmac, 'hex');
        const generatedBuffer = Buffer.from(generatedHmac, 'hex');

        if (hmacBuffer.length !== generatedBuffer.length || !timingSafeEqual(hmacBuffer, generatedBuffer)) {
            throw new UnauthorizedException('Invalid HMAC signature');
        }
    }

    // Legacy: verify using platform-level client secret
    private verifyHmac(query: Record<string, string>): void {
        this.verifyHmacWithSecret(query, this.clientSecret);
    }

    // ─── WEBHOOK MANAGEMENT ───

    private readonly WEBHOOK_TOPICS = [
        'products/create',
        'products/update',
        'products/delete',
        'orders/create',
        'orders/updated',
        'orders/cancelled',
        'orders/fulfilled',
        'orders/partially_fulfilled',
        'fulfillments/create',
        'fulfillments/update',
        'draft_orders/create',
        'draft_orders/update',
        'customers/create',
        'customers/update',
        'inventory_levels/update',
    ];

    async registerWebhooks(channelId: string): Promise<void> {
        const { token, shopDomain } = await this.getAccessToken(channelId);
        const callbackUrl = `${this.appUrl}/api/v1/webhooks/shopify`;

        // Shopify only accepts public HTTPS URLs for webhook destinations.
        // Localhost / HTTP fails 8 times (once per topic) with the same
        // error — short-circuit and log one clear actionable line instead.
        if (!callbackUrl.startsWith('https://')) {
            this.logger.warn(
                `Skipping webhook registration for channel ${channelId}: APP_URL is not HTTPS (${this.appUrl}). ` +
                `Shopify requires public HTTPS webhook URLs. Use ngrok or a public tunnel for local dev, ` +
                `or set APP_URL to your production HTTPS URL.`,
            );
            return;
        }

        for (const topic of this.WEBHOOK_TOPICS) {
            try {
                const res = await fetch(
                    `https://${shopDomain}/admin/api/${this.apiVersion}/webhooks.json`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Shopify-Access-Token': token,
                        },
                        body: JSON.stringify({
                            webhook: { topic, address: callbackUrl, format: 'json' },
                        }),
                    },
                );

                if (!res.ok) {
                    const error = await res.text();
                    this.logger.warn(`Failed to register webhook ${topic}: ${error}`);
                } else {
                    this.logger.log(`Registered webhook: ${topic} → ${callbackUrl}`);
                }
            } catch (error) {
                this.logger.error(`Error registering webhook ${topic}`, error);
            }
        }
    }

    async unregisterWebhooks(channelId: string): Promise<void> {
        try {
            const { token, shopDomain } = await this.getAccessToken(channelId);

            const res = await fetch(
                `https://${shopDomain}/admin/api/${this.apiVersion}/webhooks.json`,
                { headers: { 'X-Shopify-Access-Token': token } },
            );

            if (!res.ok) {
                this.logger.warn(`Failed to list webhooks for unregistration: ${res.status}`);
                return;
            }

            const data = (await res.json()) as { webhooks: { id: number }[] };

            for (const webhook of data.webhooks) {
                try {
                    await fetch(
                        `https://${shopDomain}/admin/api/${this.apiVersion}/webhooks/${webhook.id}.json`,
                        {
                            method: 'DELETE',
                            headers: { 'X-Shopify-Access-Token': token },
                        },
                    );
                    this.logger.log(`Unregistered webhook ${webhook.id}`);
                } catch (error) {
                    this.logger.error(`Error unregistering webhook ${webhook.id}`, error);
                }
            }
        } catch (error) {
            this.logger.warn('Could not unregister webhooks (credentials may already be cleared)', error);
        }
    }

    async getCredentials(channelId: string): Promise<{
        token: string;
        shopDomain: string;
        apiSecret: string;
    }> {
        const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
        if (!channel || !channel.credentials) {
            throw new BadRequestException('Channel not found or missing credentials');
        }

        const creds = channel.credentials as {
            accessToken: string;
            shopDomain: string;
            apiSecret: string;
        };

        return {
            token: this.encryption.decrypt(creds.accessToken),
            shopDomain: creds.shopDomain,
            apiSecret: this.encryption.decrypt(creds.apiSecret),
        };
    }
}