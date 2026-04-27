import { BillingInterval, BillingPlan } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';

// Used for creating an ORGANIZATION type org.
// Personal workspace creation uses POST /organizations/personal (see CreatePersonalDto).
export class CreateOrganizationDto {
    // Organization display name — shown in the dashboard header
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    name: string;

    // URL-safe identifier — used in URLs (e.g., app.com/org/acme-store)
    // Optional: auto-generated from name if not provided
    // Regex ensures only lowercase letters, numbers, and hyphens
    @IsOptional()
    @IsString()
    @Matches(/^[a-z0-9-]+$/, { message: 'Slug must be lowercase letters, numbers, and hyphens only' })
    slug?: string;

    @IsOptional()
    @IsUrl()
    logo?: string;

    // IANA timezone (e.g., "America/New_York", "Asia/Kolkata")
    // Used for displaying dates/times across the CRM
    @IsOptional()
    @IsString()
    timezone?: string;

    // ISO 4217 currency code (e.g., "USD", "INR", "EUR")
    // Used for revenue/order displays
    @IsOptional()
    @IsString()
    currency?: string;

    // Business industry for onboarding suggestions
    @IsOptional()
    @IsString()
    industry?: string;

    @IsOptional()
    @IsUrl()
    website?: string;

    // Selected during onboarding's choose-plan step.
    @IsEnum(BillingPlan)
    billingPlan: BillingPlan;

    @IsEnum(BillingInterval)
    billingInterval: BillingInterval;
}