import { BillingInterval, BillingPlan } from '@prisma/client';
import { IsEnum } from 'class-validator';

// Used for creating a PERSONAL workspace. Name/slug are auto-derived from the
// user's first name server-side, so the body only carries billing choices
// captured during the onboarding's choose-plan step.
export class CreatePersonalDto {
    @IsEnum(BillingPlan)
    billingPlan: BillingPlan;

    @IsEnum(BillingInterval)
    billingInterval: BillingInterval;
}
