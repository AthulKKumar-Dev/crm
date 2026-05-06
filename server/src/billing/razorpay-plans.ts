import { BillingInterval, BillingPlan } from '@prisma/client';

export type SupportedCurrency = 'INR' | 'USD';

/**
 * Razorpay Plan IDs created in the Razorpay dashboard.
 *
 * Currently only INR monthly plans are configured. Yearly + USD slots remain
 * placeholders — `resolvePlanId` will throw if any of them is requested,
 * which is the desired behavior until those Plans are created in the
 * Razorpay dashboard.
 *
 * This file is server-side only — never trust a Plan ID sent from the client.
 */
export const RAZORPAY_PLAN_IDS: Record<
    SupportedCurrency,
    Record<BillingPlan, Record<BillingInterval, string>>
> = {
    INR: {
        BASIC: {
            MONTHLY: 'plan_SlznJFDuxEUtqi',
            YEARLY: 'plan_REPLACE_basic_inr_yearly',
        },
        GROWTH: {
            MONTHLY: 'plan_Slznfo1TiLMZjP',
            YEARLY: 'plan_REPLACE_growth_inr_yearly',
        },
        ADVANCE: {
            MONTHLY: 'plan_Slzo2QbClGIEPL',
            YEARLY: 'plan_REPLACE_advance_inr_yearly',
        },
    },
    USD: {
        BASIC: {
            MONTHLY: 'plan_REPLACE_basic_usd_monthly',
            YEARLY: 'plan_REPLACE_basic_usd_yearly',
        },
        GROWTH: {
            MONTHLY: 'plan_REPLACE_growth_usd_monthly',
            YEARLY: 'plan_REPLACE_growth_usd_yearly',
        },
        ADVANCE: {
            MONTHLY: 'plan_REPLACE_advance_usd_monthly',
            YEARLY: 'plan_REPLACE_advance_usd_yearly',
        },
    },
};

export function resolvePlanId(
    currency: SupportedCurrency,
    plan: BillingPlan,
    interval: BillingInterval,
): string {
    const planId = RAZORPAY_PLAN_IDS[currency]?.[plan]?.[interval];
    if (!planId || planId.startsWith('plan_REPLACE_')) {
        throw new Error(
            `No Razorpay Plan configured for (${currency}, ${plan}, ${interval}). ` +
            `Update server/src/billing/razorpay-plans.ts with the real Plan ID.`,
        );
    }
    return planId;
}
