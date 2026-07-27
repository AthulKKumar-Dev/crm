import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import {
    WEB_PIXEL_CREATE_MUTATION,
    WEB_PIXEL_UPDATE_MUTATION,
    WEB_PIXEL_QUERY,
    WebPixelCreateResponse,
    WebPixelUpdateResponse,
    WebPixelQueryResponse,
} from './shopify-graphql.types';

@Injectable()
export class ShopifyPixelService {
    private readonly logger = new Logger(ShopifyPixelService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly oauth: ShopifyOAuthService,
        private readonly graphql: ShopifyGraphqlClient,
    ) { }

    async activatePixel(channelId: string): Promise<{ webPixelId: string }> {
        const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
        if (!channel) throw new BadRequestException(`Channel ${channelId} not found`);

        let ingestToken = channel.pixelIngestToken;
        if (!ingestToken) {
            ingestToken = randomBytes(32).toString('base64url');
            await this.prisma.channel.update({
                where: { id: channelId },
                data: { pixelIngestToken: ingestToken },
            });
        }

        const { token, shopDomain } = await this.oauth.getAccessToken(channelId);
        const auth = { accessToken: token, shopDomain };
        const settings = JSON.stringify({ accountID: ingestToken });

        const created = await this.graphql.request<WebPixelCreateResponse>(
            auth,
            WEB_PIXEL_CREATE_MUTATION,
            { webPixel: { settings } },
        );

        let webPixelId = created.webPixelCreate.webPixel?.id ?? null;
        const errors = created.webPixelCreate.userErrors;

        if (!webPixelId && errors.length > 0) {
            const taken = errors.some(
                (e) => e.code === 'TAKEN' || /taken|already exists/i.test(e.message),
            );
            if (taken) {
                const existing = await this.graphql.request<WebPixelQueryResponse>(auth, WEB_PIXEL_QUERY);
                if (!existing.webPixel?.id) {
                    throw new BadRequestException('Web pixel exists but could not be looked up');
                }
                const updated = await this.graphql.request<WebPixelUpdateResponse>(
                    auth,
                    WEB_PIXEL_UPDATE_MUTATION,
                    { id: existing.webPixel.id, webPixel: { settings } },
                );
                if (updated.webPixelUpdate.userErrors.length > 0) {
                    throw new BadRequestException(
                        `webPixelUpdate failed: ${updated.webPixelUpdate.userErrors.map((e) => e.message).join('; ')}`,
                    );
                }
                webPixelId = updated.webPixelUpdate.webPixel!.id;
            } else if (errors.some((e) => /extension|no web pixel/i.test(e.message))) {
                throw new BadRequestException(
                    'Web pixel extension is not deployed for this app — run `shopify app deploy` first',
                );
            } else if (errors.some((e) => /access|scope|permission/i.test(e.message))) {
                throw new BadRequestException(
                    'Store token lacks write_pixels scope — reconnect the store to grant the new scopes',
                );
            } else {
                throw new BadRequestException(
                    `webPixelCreate failed: ${errors.map((e) => e.message).join('; ')}`,
                );
            }
        }
        if (!webPixelId) throw new BadRequestException('webPixelCreate returned no pixel id');

        const metadata = (channel.metadata as Record<string, unknown> | null) ?? {};
        await this.prisma.channel.update({
            where: { id: channelId },
            data: { metadata: { ...metadata, webPixelId } as Prisma.InputJsonValue },
        });

        this.logger.log(`[pixel] Activated web pixel ${webPixelId} on ${shopDomain}`);
        return { webPixelId };
    }
}