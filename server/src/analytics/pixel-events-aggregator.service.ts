import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface PixelDay {
    channelId: string;
    organizationId: string;
    date: string;
    viewersByProduct: Map<string, Set<string>>;
    visitors: Set<string>;
    pageviews: number;
    addToCartVisitors: Set<string>;
    checkoutStartedVisitors: Set<string>;
}

/**
 * Rolls Web Pixel events (RawAnalyticsEvent rows with visitorId set) into
 * AnalyticsSnapshot. The pixel is the SOLE source for productViews and the
 * pixel* top-level counts; it never touches addToCarts / checkouts (webhook-
 * owned) or orders/revenue (Order-table-owned) — one source per metric.
 */
@Injectable()
export class PixelEventsAggregator {
    private readonly logger = new Logger(PixelEventsAggregator.name);

    constructor(private readonly prisma: PrismaService) { }

    @Cron(CronExpression.EVERY_HOUR)
    async runHourly(): Promise<void> {
        await this.rollup(new Date(Date.now() - 60 * 60 * 1000));
    }

    async rollupRecentDay(): Promise<void> {
        await this.rollup(new Date(Date.now() - 24 * 60 * 60 * 1000));
    }

    async rollup(since: Date): Promise<void> {
        const events = await this.prisma.rawAnalyticsEvent.findMany({
            where: {
                occurredAt: { gte: since },
                visitorId: { not: null },
                eventName: {
                    in: ['page_viewed', 'product_viewed', 'product_added_to_cart', 'checkout_started'],
                },
            },
            orderBy: { occurredAt: 'asc' },
            select: {
                organizationId: true,
                channelId: true,
                occurredAt: true,
                eventName: true,
                visitorId: true,
                payload: true,
            },
        });
        if (events.length === 0) return;

        const buckets = new Map<string, PixelDay>();
        for (const evt of events) {
            const date = evt.occurredAt.toISOString().slice(0, 10);
            const key = `${evt.channelId}:${date}`;
            const slot = buckets.get(key) ?? {
                channelId: evt.channelId,
                organizationId: evt.organizationId,
                date,
                viewersByProduct: new Map(),
                visitors: new Set(),
                pageviews: 0,
                addToCartVisitors: new Set(),
                checkoutStartedVisitors: new Set(),
            };
            const visitor = evt.visitorId!;
            slot.visitors.add(visitor);

            switch (evt.eventName) {
                case 'page_viewed':
                    slot.pageviews += 1;
                    break;
                case 'product_viewed': {
                    const title = (evt.payload as { productTitle?: string } | null)?.productTitle;
                    if (title) {
                        const viewers = slot.viewersByProduct.get(title) ?? new Set<string>();
                        viewers.add(visitor);
                        slot.viewersByProduct.set(title, viewers);
                    }
                    break;
                }
                case 'product_added_to_cart':
                    slot.addToCartVisitors.add(visitor);
                    break;
                case 'checkout_started':
                    slot.checkoutStartedVisitors.add(visitor);
                    break;
            }
            buckets.set(key, slot);
        }

        for (const bucket of buckets.values()) {
            await this.upsertSnapshot(bucket);
        }
        this.logger.log(
            `[pixel-agg] Rolled up ${events.length} pixel events into ${buckets.size} snapshot row(s)`,
        );
    }

    private async upsertSnapshot(bucket: PixelDay): Promise<void> {
        const date = new Date(`${bucket.date}T00:00:00.000Z`);
        const existing = await this.prisma.analyticsSnapshot.findUnique({
            where: {
                channelId_date_granularity: { channelId: bucket.channelId, date, granularity: 'DAILY' },
            },
        });
        const existingMetrics = (existing?.metrics as Record<string, unknown> | null) ?? {};

        const byProduct = new Map<
            string,
            { productViews: number; addToCarts: number; checkouts: number; orders: number }
        >();
        for (const row of (existingMetrics.byProduct as Array<{
            productTitle: string; productViews?: number; addToCarts?: number;
            checkouts?: number; orders?: number;
        }> | undefined) ?? []) {
            byProduct.set(row.productTitle, {
                productViews: row.productViews ?? 0,
                addToCarts: row.addToCarts ?? 0,
                checkouts: row.checkouts ?? 0,
                orders: row.orders ?? 0,
            });
        }
        for (const [title, viewers] of bucket.viewersByProduct) {
            const slot = byProduct.get(title) ?? { productViews: 0, addToCarts: 0, checkouts: 0, orders: 0 };
            slot.productViews = viewers.size;
            byProduct.set(title, slot);
        }

        const nextMetrics = {
            ...existingMetrics,
            byProduct: Array.from(byProduct.entries()).map(([productTitle, v]) => ({ productTitle, ...v })),
            pixelSessions: bucket.visitors.size,
            pixelPageviews: bucket.pageviews,
            pixelAddToCartSessions: bucket.addToCartVisitors.size,
            pixelCheckoutStartedSessions: bucket.checkoutStartedVisitors.size,
        };

        await this.prisma.analyticsSnapshot.upsert({
            where: {
                channelId_date_granularity: { channelId: bucket.channelId, date, granularity: 'DAILY' },
            },
            create: {
                organizationId: bucket.organizationId,
                channelId: bucket.channelId,
                date,
                granularity: 'DAILY',
                source: 'shopify_pixel',
                metrics: nextMetrics as Prisma.InputJsonValue,
            },
            update: {
                source: existing?.source ?? 'shopify_pixel',
                metrics: nextMetrics as Prisma.InputJsonValue,
            },
        });
    }
}