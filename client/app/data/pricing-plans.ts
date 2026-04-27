import type { BillingPlan } from "~/types/api";

/**
 * Static display metadata for each billing plan.
 *
 * Single source of truth for plan names, prices, and features — consumed by the
 * onboarding choose-plan page and the settings billing panel. The server only
 * stores the plan id (see Prisma `BillingPlan` enum); prices and feature lists
 * live here so they can be tweaked without a migration.
 *
 * Prices are in INR (Razorpay's primary currency for this app). The matching
 * Razorpay Plans must be created with the same amounts in INR — see
 * server/src/billing/razorpay-plans.ts for the Plan IDs.
 */
export interface PricingPlan {
  id: BillingPlan;
  name: string;
  tagline: string;
  priceMonthlyInr: number;
  priceYearlyInr: number;
  features: readonly string[];
  /** Marks the recommended plan (rendered with a "Popular" ribbon in the UI). */
  highlighted?: boolean;
}

export const PRICING_PLANS: readonly PricingPlan[] = [
  {
    id: "BASIC",
    name: "Basic",
    tagline: "Everything a small team needs to manage customers and orders.",
    priceMonthlyInr: 999,
    priceYearlyInr: 9999,
    features: [
      "Features",
      "Features",
      "Features",
    ],
  },
  {
    id: "ADVANCE",
    name: "Advance",
    tagline: "For growing teams that need automation, integrations, and insights.",
    priceMonthlyInr: 2999,
    priceYearlyInr: 29999,
    features: [
      "Features",
      "Features",
      "Features",
      "Features",
    ],
    highlighted: true,
  },
] as const;

/** Returns the pricing plan config for a given `BillingPlan` id. Throws if unknown. */
export function getPricingPlan(id: BillingPlan): PricingPlan {
  const plan = PRICING_PLANS.find((entry) => entry.id === id);
  if (!plan) throw new Error(`Unknown pricing plan: ${id}`);
  return plan;
}
