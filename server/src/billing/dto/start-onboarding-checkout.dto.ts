import { BillingInterval, BillingPlan } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class StartOnboardingCheckoutDto {
    @IsEnum(BillingPlan)
    billingPlan: BillingPlan;

    @IsEnum(BillingInterval)
    billingInterval: BillingInterval;
}
