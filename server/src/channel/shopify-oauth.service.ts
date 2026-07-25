import {
    Injectable,
    ConflictException,
    BadRequestException,
    UnauthorizedException,
    ServiceUnavailableException,
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
import { ShopifyGraphqlClient, ShopifyGraphqlError } from './shopify-graphql.client';
import {
    SHOP_INFO_QUERY,
    ShopInfoResponse,
    WEBHOOK_SUBSCRIPTION_CREATE_MUTATION,
    WebhookSubscriptionCreateResponse,
    WebhookSubscriptionCreateVariables,
    WEBHOOK_SUBSCRIPTIONS_QUERY,
    WebhookSubscriptionsListResponse,
    WEBHOOK_SUBSCRIPTION_DELETE_MUTATION,
    WebhookSubscriptionDeleteResponse,
} from './shopify-graphql.types';

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
        private readonly graphql: ShopifyGraphqlClient,
    ) {
        this.clientId = this.config.get<string>('shopify.clientId')!;
        this.clientSecret = this.config.get<string>('shopify.clientSecret')!;
        // Scope list comes from config (SHOPIFY_SCOPES) and MUST mirror the
        // [access_scopes] block in the public app's shopify.app.toml — with
        // include_config_on_deploy the deployed TOML is what Shopify actually
        // grants, regardless of the scope param in the authorize URL.
        // Existing tokens are pinned to the scopes they were issued with;
        // merchants must reconnect (re-run the install redirect) to pick up
        // newly added scopes.
        this.scopes = this.config.get<string>('shopify.scopes')!;
        this.appUrl = this.config.get<string>('appUrl')!;
        this.apiVersion = this.config.get<string>('shopify.apiVersion') ?? '2026-01';
    }

    // ─── PUBLIC APP OAUTH ───
    // The CRM's public Shopify app (created in the Partner Dashboard) is
    // installed into the merchant's store. The merchant only supplies their
    // shop domain — client_id/client_secret are platform-level env config.
    // The authorization-code grant issues a permanent OFFLINE access token
    // (no grant_options[] param), which only dies when the merchant
    // uninstalls the app or the app's client secret is rotated.

    // Accepts "my-store", "my-store.myshopify.com", or a full admin URL and
    // returns the canonical "my-store.myshopify.com" — or throws.
    private normalizeShopDomain(input: string): string {
        let domain = input
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/\/.*$/, '');
        if (!domain.includes('.')) domain = `${domain}.myshopify.com`;
        if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
            throw new BadRequestException(
                'Enter your myshopify.com store domain, e.g. "my-store" or "my-store.myshopify.com"',
            );
        }
        return domain;
    }

    // Step 1: Generate the Shopify authorization URL for the public app
    async getInstallUrl(orgId: string, userId: string, rawShopDomain: string): Promise<string> {
        if (!this.clientId || !this.clientSecret) {
            throw new ServiceUnavailableException(
                'Shopify app credentials are not configured (SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET)',
            );
        }
        const shopDomain = this.normalizeShopDomain(rawShopDomain);

        // One CRM org per store — webhook routing is by shop domain, so a
        // second org connecting the same store would silently steal the
        // other's events.
        const takenByOtherOrg = await this.prisma.channel.findFirst({
            where: {
                platform: ChannelPlatform.SHOPIFY,
                externalStoreUrl: `https://${shopDomain}`,
                organizationId: { not: orgId },
                status: ChannelStatus.CONNECTED,
            },
            select: { id: true },
        });
        if (takenByOtherOrg) {
            throw new ConflictException('This Shopify store is already connected to another organization');
        }

        // A DISCONNECTED channel (app uninstalled / dead token) may
        // reconnect — the callback then updates the row instead of creating
        // a duplicate (which would trip the org+platform unique constraint).
        const existing = await this.prisma.channel.findUnique({
            where: { organizationId_platform: { organizationId: orgId, platform: ChannelPlatform.SHOPIFY } },
        });
        if (existing && existing.status === ChannelStatus.CONNECTED && existing.credentials) {
            // Same shop re-authing (e.g. to grant newly added scopes) is fine —
            // the callback updates the row via reconnectChannelId. Only block
            // connecting a DIFFERENT shop while one is already connected.
            const sameShop = existing.externalStoreUrl === `https://${shopDomain}`;
            if (!sameShop) {
                throw new ConflictException('This organization already has a Shopify store connected');
            }
        }

        const state = randomBytes(16).toString('hex');
        await this.redis.set(`oauth:shopify:${state}`, {
            userId, orgId, shopDomain,
            reconnectChannelId: existing?.id,
        }, REDIS_TTL.OAUTH_STATE);

        const redirectUri = `${this.appUrl}/api/v1/channels/shopify/callback`;

        return (
            `https://${shopDomain}/admin/oauth/authorize` +
            `?client_id=${this.clientId}` +
            `&scope=${this.scopes}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&state=${state}`
        );
    }

    // Step 2: Handle the OAuth callback from Shopify
    async handleCallback(query: {
        code?: string;
        hmac: string;
        shop: string;
        state: string;
        timestamp: string;
    }): Promise<{ channelId: string; organizationId: string; redirectUrl: string }> {
        // 1. Validate + consume CSRF state
        const stateData = await this.redis.get<{
            userId: string; orgId: string; shopDomain: string;
            reconnectChannelId?: string;
        }>(`oauth:shopify:${query.state}`);
        if (!stateData) {
            throw new UnauthorizedException('Invalid or expired state parameter');
        }
        await this.redis.del(`oauth:shopify:${query.state}`);

        // 2. Merchant hit "cancel" on the grant screen → redirect without a code
        if (!query.code) {
            throw new BadRequestException('Installation was cancelled');
        }

        // 3. Validate HMAC with the app's client secret
        this.verifyHmac(query as unknown as Record<string, string>);

        // 4. Shop param must be a valid myshopify domain AND the one we started with
        if (
            !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(query.shop) ||
            query.shop !== stateData.shopDomain
        ) {
            throw new BadRequestException('Shop domain mismatch');
        }

        // 5. Exchange code for an EXPIRING offline token — mandatory for public
        // apps created on/after 2026-04-01 (`expiring: '1'`). The response then
        // carries a 1-hour access token plus a 90-day rotating refresh token;
        // getAccessToken() below transparently refreshes on use.
        const tokenResponse = await fetch(
            `https://${query.shop}/admin/oauth/access_token`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    code: query.code,
                    expiring: '1',
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
            expires_in?: number;
            refresh_token?: string;
            refresh_token_expires_in?: number;
        };

        // 6. Get shop info — GraphQL only. REST `shop.json` returns 403 for
        // apps created after Shopify's REST Admin API sunset.
        let shopInfo: ShopInfoResponse['shop'];
        try {
            const res = await this.graphql.request<ShopInfoResponse>(
                { shopDomain: query.shop, accessToken: tokenData.access_token },
                SHOP_INFO_QUERY,
            );
            shopInfo = res.shop;
        } catch (error) {
            this.logger.error(
                `Shop info query failed after token exchange: ${error instanceof Error ? error.message : error}`,
                error instanceof ShopifyGraphqlError ? JSON.stringify(error.details) : undefined,
            );
            throw new BadRequestException('Could not fetch shop details');
        }
        const shopData = {
            shop: {
                id: ShopifyGraphqlClient.extractId(shopInfo.id),
                name: shopInfo.name,
                currency: shopInfo.currencyCode,
            },
        };

        // 7. Store credentials — accessToken (+ refresh token & expiries for
        // expiring tokens). Public-app installs carry no per-merchant
        // apiKey/apiSecret; webhooks are HMAC-verified with the app-level
        // client secret instead.
        const channelData = {
            name: shopData.shop.name || query.shop,
            status: ChannelStatus.CONNECTED,
            isEnabled: true,
            credentials: {
                accessToken: this.encryption.encrypt(tokenData.access_token),
                ...(tokenData.refresh_token
                    ? {
                        refreshToken: this.encryption.encrypt(tokenData.refresh_token),
                        accessTokenExpiresAt: new Date(
                            Date.now() + (tokenData.expires_in ?? 3600) * 1000,
                        ).toISOString(),
                        refreshTokenExpiresAt: new Date(
                            Date.now() + (tokenData.refresh_token_expires_in ?? 7776000) * 1000,
                        ).toISOString(),
                    }
                    : {}),
                shopDomain: query.shop,
                scopes: tokenData.scope,
            },
            externalStoreId: String(shopData.shop.id),
            externalStoreUrl: `https://${query.shop}`,
            syncStatus: SyncStatus.IDLE,
        };

        // 8. Create (or, on reconnect, update) the Channel + inherit the org
        // currency atomically. The Shopify shop is the source of truth for
        // the org's currency — merchants sell in whatever currency their
        // storefront is set to, so we inherit it here instead of asking
        // during onboarding. Only updates if Shopify returned a non-empty
        // currency; otherwise leaves the existing org currency alone.
        const channel = await this.prisma.$transaction(async (tx) => {
            const ch = stateData.reconnectChannelId
                ? await tx.channel.update({
                    where: { id: stateData.reconnectChannelId },
                    data: channelData,
                })
                : await tx.channel.create({
                    data: {
                        organizationId: stateData.orgId,
                        platform: ChannelPlatform.SHOPIFY,
                        ...channelData,
                    },
                });
            if (shopData.shop.currency) {
                await tx.organization.update({
                    where: { id: stateData.orgId },
                    data: { currency: shopData.shop.currency },
                });
            }
            return ch;
        });

        this.logger.log(
            `Shopify store connected (public app): ${query.shop} → org ${stateData.orgId} ` +
            `(currency: ${shopData.shop.currency ?? 'unchanged'}` +
            `${stateData.reconnectChannelId ? ', reconnect' : ''})`,
        );

        // Removed: automatic bulk-push of CRM-only products on Shopify connect.
        // Merchants now decide what crosses the line — they can push individual
        // items via the per-row Sync action, or run a one-click bulk push from
        // the Channels page Sync button (which now also pushes unsynced data).

        const frontendUrl = this.config.get<string>('frontendUrl');
        const redirectUrl = `${frontendUrl}/channel?connected=shopify&channelId=${channel.id}`;

        return { channelId: channel.id, organizationId: stateData.orgId, redirectUrl };
    }

    // ─── MANUAL CONNECT (legacy fallback) ───
    // For merchants who create a custom app in their Shopify Admin and provide
    // credentials. Kept as the de-emphasized "Advanced" path in the connect
    // dialog for stores that can't install the public app. Channels created
    // here carry a per-merchant apiSecret in credentials, which the webhook
    // controller still accepts as a legacy HMAC fallback.
    async manualConnect(orgId: string, shopDomain: string, apiKey: string, apiSecret: string, accessToken: string) {
        // Check if org already has a Shopify channel
        const existing = await this.prisma.channel.findUnique({
            where: { organizationId_platform: { organizationId: orgId, platform: ChannelPlatform.SHOPIFY } },
        });
        if (existing) {
            throw new ConflictException('A Shopify store is already connected. Disconnect it first.');
        }

        // Validate the token by fetching shop info via GraphQL (works for both
        // legacy custom-app tokens and new-app tokens; REST shop.json is 403
        // for recently-created apps).
        let shopData: { shop: { id: string; name: string; currency: string } };
        try {
            const res = await this.graphql.request<ShopInfoResponse>(
                { shopDomain, accessToken },
                SHOP_INFO_QUERY,
            );
            shopData = {
                shop: {
                    id: ShopifyGraphqlClient.extractId(res.shop.id),
                    name: res.shop.name,
                    currency: res.shop.currencyCode,
                },
            };
        } catch (error) {
            if (error instanceof ShopifyGraphqlError && error.code === 'AUTH_FAILED') {
                this.logger.error(`Shopify credential validation failed: ${error.message}`);
                throw new BadRequestException(
                    'Invalid credentials. Please check your store URL and access token.',
                );
            }
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

        const creds = channel.credentials as {
            accessToken: string;
            shopDomain: string;
            refreshToken?: string;
            accessTokenExpiresAt?: string;
            refreshTokenExpiresAt?: string;
        };

        // Legacy custom-app channels carry a non-expiring token — no refresh.
        if (!creds.refreshToken || !creds.accessTokenExpiresAt) {
            return { token: this.encryption.decrypt(creds.accessToken), shopDomain: creds.shopDomain };
        }

        // Expiring offline token (public app, 1h TTL): return while it still
        // has >2 minutes of life, otherwise refresh before use.
        const expiresAt = new Date(creds.accessTokenExpiresAt).getTime();
        if (expiresAt - Date.now() > 2 * 60 * 1000) {
            return { token: this.encryption.decrypt(creds.accessToken), shopDomain: creds.shopDomain };
        }

        return this.refreshAccessToken(channelId);
    }

    /**
     * Refresh an expiring offline access token (1h TTL) using the stored
     * 90-day refresh token. Refresh tokens ROTATE — each refresh returns a new
     * one and consumes the old — so concurrent workers are serialised through
     * a short Redis lock; losers wait and re-read what the winner persisted.
     */
    private async refreshAccessToken(channelId: string): Promise<{ token: string; shopDomain: string }> {
        const lockKey = `oauth:shopify:refresh:${channelId}`;
        const gotLock = await this.redis.acquireLock(lockKey, 15);
        if (!gotLock) {
            await new Promise((r) => setTimeout(r, 2000));
            return this.getAccessToken(channelId);
        }

        try {
            // Re-read inside the lock — another worker may have already
            // refreshed while this one queued for the lock.
            const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
            const current = channel?.credentials as {
                accessToken: string;
                shopDomain: string;
                refreshToken?: string;
                accessTokenExpiresAt?: string;
            } | null;
            if (!current?.refreshToken) {
                throw new BadRequestException(`Shopify channel ${channelId} has no refresh token`);
            }
            const expiresAt = current.accessTokenExpiresAt
                ? new Date(current.accessTokenExpiresAt).getTime()
                : 0;
            if (expiresAt - Date.now() > 2 * 60 * 1000) {
                return { token: this.encryption.decrypt(current.accessToken), shopDomain: current.shopDomain };
            }

            const res = await fetch(`https://${current.shopDomain}/admin/oauth/access_token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'refresh_token',
                    refresh_token: this.encryption.decrypt(current.refreshToken),
                }),
            });

            if (!res.ok) {
                const errorBody = await res.text();
                this.logger.error(
                    `Shopify token refresh failed for channel ${channelId}: ${res.status} ${errorBody}`,
                );
                // Refresh token expired (store idle >90 days) or revoked —
                // flip to DISCONNECTED so the UI surfaces "Reconnect".
                await this.prisma.channel.update({
                    where: { id: channelId },
                    data: { status: ChannelStatus.DISCONNECTED },
                });
                throw new UnauthorizedException(
                    'Shopify access expired. Reconnect the store from the Channels page.',
                );
            }

            const data = (await res.json()) as {
                access_token: string;
                expires_in?: number;
                refresh_token?: string;
                refresh_token_expires_in?: number;
            };

            const updatedCreds: Record<string, unknown> = {
                ...(channel!.credentials as Record<string, unknown>),
                accessToken: this.encryption.encrypt(data.access_token),
                accessTokenExpiresAt: new Date(
                    Date.now() + (data.expires_in ?? 3600) * 1000,
                ).toISOString(),
                ...(data.refresh_token
                    ? { refreshToken: this.encryption.encrypt(data.refresh_token) }
                    : {}),
                ...(data.refresh_token_expires_in
                    ? {
                        refreshTokenExpiresAt: new Date(
                            Date.now() + data.refresh_token_expires_in * 1000,
                        ).toISOString(),
                    }
                    : {}),
            };
            await this.prisma.channel.update({
                where: { id: channelId },
                data: { credentials: updatedCreds as any },
            });

            this.logger.log(`Refreshed Shopify access token for channel ${channelId}`);
            return { token: data.access_token, shopDomain: current.shopDomain };
        } finally {
            await this.redis.del(lockKey);
        }
    }

    // Verify Shopify OAuth-callback HMAC (hex, over sorted query params minus
    // `hmac`) using a specific secret
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

    // Primary: verify using the public app's client secret
    private verifyHmac(query: Record<string, string>): void {
        this.verifyHmacWithSecret(query, this.clientSecret);
    }

    // ─── WEBHOOK MANAGEMENT ───

    private readonly WEBHOOK_TOPICS = [
        // Lifecycle: fired when the merchant removes the app — the access
        // token is revoked at that moment, so the webhook controller flips
        // the channel to DISCONNECTED and nulls its credentials.
        // (GDPR compliance topics are NOT registered here — they are
        // configured in the Partner Dashboard / shopify.app.toml only.)
        'app/uninstalled',
        'products/create',
        'products/update',
        'products/delete',
        'orders/create',
        'orders/updated',
        'orders/cancelled',
        'orders/fulfilled',
        'orders/partially_fulfilled',
        // NOTE: `fulfillments/create` and `fulfillments/update` are NOT
        // valid Shopify webhook topics — Shopify rejects them with
        // "Invalid topic specified". The fulfillment data is already
        // reconciled through `orders/fulfilled` and `orders/updated`
        // (both flow through `upsertOrder`, which reads the fulfillments
        // array off the parent order). If we ever need per-fulfillment
        // events, the correct family is `fulfillment_orders/*` — but the
        // webhook controller doesn't act on those today, so subscribing
        // would just create noise.
        'draft_orders/create',
        'draft_orders/update',
        'customers/create',
        'customers/update',
        'inventory_levels/update',
        // Analytics — populates `RawAnalyticsEvent` and feeds the hourly
        // aggregator that lights up the per-product add-to-cart and
        // per-product checkout panels on the analytics page.
        'carts/create',
        'carts/update',
        'checkouts/create',
        'checkouts/update',
        'checkouts/delete',
    ];

    /** REST topic string → WebhookSubscriptionTopic enum (products/create → PRODUCTS_CREATE). */
    private toWebhookTopicEnum(topic: string): string {
        return topic.toUpperCase().replace(/\//g, '_');
    }

    async registerWebhooks(channelId: string): Promise<void> {
        const { token, shopDomain } = await this.getAccessToken(channelId);
        const callbackUrl = `${this.appUrl}/api/v1/webhooks/shopify`;

        // Shopify only accepts public HTTPS URLs for webhook destinations.
        // Localhost / HTTP fails once per topic with the same error —
        // short-circuit and log one clear actionable line instead.
        if (!callbackUrl.startsWith('https://')) {
            this.logger.warn(
                `Skipping webhook registration for channel ${channelId}: APP_URL is not HTTPS (${this.appUrl}). ` +
                `Shopify requires public HTTPS webhook URLs. Use ngrok or a public tunnel for local dev, ` +
                `or set APP_URL to your production HTTPS URL.`,
            );
            return;
        }

        const auth = { shopDomain, accessToken: token };
        for (const topic of this.WEBHOOK_TOPICS) {
            try {
                const res = await this.graphql.request<
                    WebhookSubscriptionCreateResponse,
                    WebhookSubscriptionCreateVariables
                >(auth, WEBHOOK_SUBSCRIPTION_CREATE_MUTATION, {
                    topic: this.toWebhookTopicEnum(topic),
                    webhookSubscription: { callbackUrl, format: 'JSON' },
                });

                const userErrors = res.webhookSubscriptionCreate?.userErrors ?? [];
                if (userErrors.length > 0) {
                    // "Address for this topic has already been taken" = already
                    // registered — idempotent success, same as the old REST path.
                    const alreadyTaken = userErrors.every((e) =>
                        e.message.toLowerCase().includes('already been taken'),
                    );
                    if (alreadyTaken) {
                        this.logger.debug(`Webhook ${topic} already registered for ${shopDomain}`);
                    } else {
                        this.logger.warn(
                            `Failed to register webhook ${topic}: ${userErrors.map((e) => e.message).join('; ')}`,
                        );
                    }
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
            const auth = { shopDomain, accessToken: token };

            const list = await this.graphql.request<WebhookSubscriptionsListResponse>(
                auth,
                WEBHOOK_SUBSCRIPTIONS_QUERY,
                { first: 100 },
            );

            for (const webhook of list.webhookSubscriptions?.nodes ?? []) {
                try {
                    await this.graphql.request<WebhookSubscriptionDeleteResponse>(
                        auth,
                        WEBHOOK_SUBSCRIPTION_DELETE_MUTATION,
                        { id: webhook.id },
                    );
                    this.logger.log(`Unregistered webhook ${webhook.id} (${webhook.topic})`);
                } catch (error) {
                    this.logger.error(`Error unregistering webhook ${webhook.id}`, error);
                }
            }
        } catch (error) {
            this.logger.warn('Could not unregister webhooks (credentials may already be cleared)', error);
        }
    }

}