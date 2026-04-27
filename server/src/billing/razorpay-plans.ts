import { BillingInterval, BillingPlan } from '@prisma/client';

export type SupportedCurrency = 'INR' | 'USD';

/**
 * Razorpay Plan IDs created in the Razorpay dashboard.
 *
 * One Plan per (currency, plan, interval) combination — 8 total. Replace the
 * `plan_REPLACE_*` placeholders with real Plan IDs after creating them in
 * https://dashboard.razorpay.com/app/subscriptions/plans.
 *
 * This file is server-side only — never trust a Plan ID sent from the client.
 */
export const RAZORPAY_PLAN_IDS: Record<
    SupportedCurrency,
    Record<BillingPlan, Record<BillingInterval, string>>
> = {
    INR: {
        BASIC: {
            MONTHLY: 'plan_SiRxjIEEXLXNi7',
            YEARLY: 'plan_SiRzQDryp03aJ8',
        },
        ADVANCE: {
            MONTHLY: 'plan_SiS0GUroFwvmfc',
            YEARLY: 'plan_SiS1vtdbIwb4Vm',
        },
    },
    USD: {
        BASIC: {
            MONTHLY: 'plan_REPLACE_basic_usd_monthly',
            YEARLY: 'plan_REPLACE_basic_usd_yearly',
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
