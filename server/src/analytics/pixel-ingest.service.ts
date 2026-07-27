import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChannelStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PixelEventDto, PixelIngestDto } from './dto/pixel-ingest.dto';

interface ChannelRef {
    id: string;
    organizationId: string;
}

const MAX_PAYLOAD_JSON = 8_192;
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PixelIngestService {
    private readonly logger = new Logger(PixelIngestService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
    ) { }

    async ingest(dto: PixelIngestDto): Promise<{ accepted: number }> {
        const channel = await this.resolveChannel(dto.token);

        const rows: Prisma.RawAnalyticsEventCreateManyInput[] = [];
        for (const event of dto.events) {
            const fresh = await this.redis.acquireLock(
                `pixel:evt:${channel.id}:${event.id}`,
                86_400,
            );
            if (!fresh) continue;

            rows.push({
                organizationId: channel.organizationId,
                channelId: channel.id,
                eventName: event.name,
                occurredAt: this.clampTimestamp(event.timestamp),
                visitorId: dto.clientId,
                sessionId: this.extractSessionId(event),
                externalCustomerId: this.extractCustomerId(event),
                payload: this.trimPayload(event) as Prisma.InputJsonValue,
            });
        }

        if (rows.length > 0) {
            await this.prisma.rawAnalyticsEvent.createMany({ data: rows });
        }
        return { accepted: rows.length };
    }

    private async resolveChannel(token: string): Promise<ChannelRef> {
        const cacheKey = `pixel:token:${token}`;
        const cached = await this.redis.get<ChannelRef>(cacheKey);
        if (cached) return cached;

        const channel = await this.prisma.channel.findUnique({
            where: { pixelIngestToken: token },
            select: { id: true, organizationId: true, status: true },
        });
        if (!channel || channel.status === ChannelStatus.DISCONNECTED) {
            throw new NotFoundException();
        }
        const ref: ChannelRef = { id: channel.id, organizationId: channel.organizationId };
        await this.redis.set(cacheKey, ref, 600);
        return ref;
    }

    private clampTimestamp(iso: string): Date {
        const t = new Date(iso).getTime();
        const now = Date.now();
        if (!Number.isFinite(t) || Math.abs(now - t) > MAX_CLOCK_SKEW_MS) return new Date(now);
        return new Date(t);
    }

    private extractSessionId(event: PixelEventDto): string | null {
        const data = (event.data ?? {}) as Record<string, any>;
        if (event.name === 'checkout_started' || event.name === 'checkout_completed') {
            return data.checkout?.token ?? null;
        }
        if (event.name === 'cart_viewed') return data.cart?.id ?? null;
        if (event.name === 'product_added_to_cart') return data.cartLine?.cart?.id ?? null;
        return null;
    }

    private extractCustomerId(event: PixelEventDto): string | null {
        const data = (event.data ?? {}) as Record<string, any>;
        const id = data.checkout?.order?.customer?.id;
        return id != null ? String(id) : null;
    }

    private trimPayload(event: PixelEventDto): Record<string, unknown> {
        const data = (event.data ?? {}) as Record<string, any>;
        const out: Record<string, unknown> = { pixelEventId: event.id };

        switch (event.name) {
            case 'page_viewed': {
                // Sent by the pixel extension as data.page — the standard
                // page_viewed event carries no location in `data`, so the
                // extension copies it from event.context.document.
                const page = (data.page ?? {}) as { pathname?: string; title?: string };
                out.pagePath = page.pathname ?? null;
                out.pageTitle = page.title ?? null;
                break;
            }
            case 'product_viewed': {
                const v = data.productVariant;
                out.productId = v?.product?.id ?? null;
                out.productTitle = v?.product?.title ?? null;
                out.price = v?.price?.amount ?? null;
                break;
            }
            case 'product_added_to_cart': {
                const line = data.cartLine;
                out.productId = line?.merchandise?.product?.id ?? null;
                out.productTitle = line?.merchandise?.product?.title ?? null;
                out.quantity = line?.quantity ?? null;
                break;
            }
            case 'collection_viewed':
                out.collectionTitle = data.collection?.title ?? null;
                break;
            case 'search_submitted':
                out.query = data.searchResult?.query ?? null;
                break;
            case 'checkout_started':
            case 'checkout_completed':
                out.checkoutToken = data.checkout?.token ?? null;
                out.totalPrice = data.checkout?.totalPrice?.amount ?? null;
                if (event.name === 'checkout_completed') {
                    out.orderId = data.checkout?.order?.id ?? null;
                }
                break;
            default:
                break;
        }

        if (JSON.stringify(out).length > MAX_PAYLOAD_JSON) {
            return { pixelEventId: event.id, truncated: true };
        }
        return out;
    }
}