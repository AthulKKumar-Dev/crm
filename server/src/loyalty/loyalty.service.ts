import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { LoyaltyMetric, Prisma, VipLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface LoyaltyConfig {
    loyaltyMetric: LoyaltyMetric;
    loyaltyBronzeMin: Prisma.Decimal;
    loyaltySilverMin: Prisma.Decimal;
    loyaltyGoldMin: Prisma.Decimal;
    loyaltyPlatinumMin: Prisma.Decimal;
}

/**
 * Compute-and-assign loyalty tier logic for customers.
 *
 * Call `recomputeForCustomer` any time a write touches `Customer.ordersCount`
 * or `Customer.totalSpent` so the tier stays in sync. Today the only such
 * write is `ShopifySyncService.upsertCustomer`, but add this hook everywhere
 * those fields get touched in the future.
 */
@Injectable()
export class LoyaltyService {
    private readonly logger = new Logger(LoyaltyService.name);
    // Rejects concurrent `recomputeAll` calls for the same org (409 Conflict).
    private readonly recomputingOrgs = new Set<string>();

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Pure: decides a customer's tier from org thresholds + the chosen metric.
     * Uses Prisma.Decimal comparison (>=) since thresholds & totalSpent are Decimal.
     */
    computeTier(org: LoyaltyConfig, ordersCount: number, totalSpent: Prisma.Decimal | string | number): VipLevel {
        const value =
            org.loyaltyMetric === LoyaltyMetric.ORDERS
                ? new Prisma.Decimal(ordersCount)
                : new Prisma.Decimal(totalSpent as any);

        if (value.gte(org.loyaltyPlatinumMin)) return VipLevel.PLATINUM;
        if (value.gte(org.loyaltyGoldMin)) return VipLevel.GOLD;
        if (value.gte(org.loyaltySilverMin)) return VipLevel.SILVER;
        if (value.gte(org.loyaltyBronzeMin)) return VipLevel.BRONZE;
        return VipLevel.NONE;
    }

    /**
     * Recompute a single customer's vipLevel. Writes only if the tier changed,
     * and records one CustomerActivityLog row tagged `vip_auto_recompute`.
     */
    async recomputeForCustomer(customerId: string, orgId: string): Promise<VipLevel | null> {
        const [org, customer] = await Promise.all([
            this.prisma.organization.findUnique({
                where: { id: orgId },
                select: {
                    loyaltyMetric: true,
                    loyaltyBronzeMin: true,
                    loyaltySilverMin: true,
                    loyaltyGoldMin: true,
                    loyaltyPlatinumMin: true,
                },
            }),
            this.prisma.customer.findFirst({
                where: { id: customerId, organizationId: orgId, deletedAt: null },
                select: { id: true, vipLevel: true, ordersCount: true, totalSpent: true },
            }),
        ]);
        if (!org || !customer) return null;

        const nextTier = this.computeTier(org, customer.ordersCount, customer.totalSpent);
        if (nextTier === customer.vipLevel) return customer.vipLevel;

        await this.prisma.$transaction([
            this.prisma.customer.update({
                where: { id: customer.id },
                data: { vipLevel: nextTier },
            }),
            this.prisma.customerActivityLog.create({
                data: {
                    customerId: customer.id,
                    action: 'vip_auto_recompute',
                    description: `VIP auto-updated from ${customer.vipLevel} to ${nextTier}`,
                    oldValue: customer.vipLevel,
                    newValue: nextTier,
                },
            }),
        ]);
        return nextTier;
    }

    /**
     * Batch recompute every customer in an org.
     *
     * Uses 5 `updateMany` calls (one per tier range) so the cost stays at 5
     * SQL statements regardless of customer count. Skips per-customer activity
     * log rows — a bulk recompute against 50k customers shouldn't flood the log
     * table.
     */
    async recomputeAll(orgId: string): Promise<{ updated: number; total: number }> {
        if (this.recomputingOrgs.has(orgId)) {
            throw new ConflictException('A loyalty recompute is already running for this organization.');
        }
        this.recomputingOrgs.add(orgId);

        try {
            const org = await this.prisma.organization.findUnique({
                where: { id: orgId },
                select: {
                    loyaltyMetric: true,
                    loyaltyBronzeMin: true,
                    loyaltySilverMin: true,
                    loyaltyGoldMin: true,
                    loyaltyPlatinumMin: true,
                },
            });
            if (!org) return { updated: 0, total: 0 };

            const total = await this.prisma.customer.count({
                where: { organizationId: orgId, deletedAt: null },
            });

            const metricField = org.loyaltyMetric === LoyaltyMetric.ORDERS ? 'ordersCount' : 'totalSpent';

            // Each tier gets a half-open range [min, nextMin). PLATINUM has no upper bound.
            // NONE covers anything below BRONZE's min.
            const ranges: Array<{ tier: VipLevel; gte: Prisma.Decimal | null; lt: Prisma.Decimal | null }> = [
                { tier: VipLevel.NONE, gte: null, lt: org.loyaltyBronzeMin },
                { tier: VipLevel.BRONZE, gte: org.loyaltyBronzeMin, lt: org.loyaltySilverMin },
                { tier: VipLevel.SILVER, gte: org.loyaltySilverMin, lt: org.loyaltyGoldMin },
                { tier: VipLevel.GOLD, gte: org.loyaltyGoldMin, lt: org.loyaltyPlatinumMin },
                { tier: VipLevel.PLATINUM, gte: org.loyaltyPlatinumMin, lt: null },
            ];

            let updated = 0;
            for (const range of ranges) {
                const metricWhere: { gte?: Prisma.Decimal; lt?: Prisma.Decimal } = {};
                if (range.gte !== null) metricWhere.gte = range.gte;
                if (range.lt !== null) metricWhere.lt = range.lt;

                const result = await this.prisma.customer.updateMany({
                    where: {
                        organizationId: orgId,
                        deletedAt: null,
                        vipLevel: { not: range.tier },
                        [metricField]: metricWhere,
                    } as Prisma.CustomerWhereInput,
                    data: { vipLevel: range.tier },
                });
                updated += result.count;
            }

            this.logger.log(
                `Loyalty recompute complete for org ${orgId}: ${updated}/${total} customers updated (metric=${org.loyaltyMetric}).`,
            );
            return { updated, total };
        } finally {
            this.recomputingOrgs.delete(orgId);
        }
    }
}
