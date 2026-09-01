import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength } from 'class-validator';
import { LoyaltyMetric } from '@prisma/client';
import { LoyaltyConsistent } from '../validators/loyalty-consistent.validator';
import { IsIanaTimeZone } from '../../common/validators/is-iana-timezone.validator';

// Same fields as create, but all optional (partial update)
// Plus settings fields (lowStockThreshold, gstEnabled, loyalty*) that don't belong at creation time.
export class UpdateOrganizationDto {
    @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
    @IsOptional() @IsUrl() logo?: string;
    // Must resolve in Intl: an unparseable zone reaches `zonedParts` and throws
    // RangeError from every GST date path, not just this endpoint.
    @IsOptional() @IsIanaTimeZone() timezone?: string;
    @IsOptional() @IsString() currency?: string;
    @IsOptional() @IsString() industry?: string;
    @IsOptional() @IsUrl() website?: string;

    // Global low stock threshold — products without their own threshold use this
    // Min 1 because 0 would mean "never alert" which should be a separate toggle
    @IsOptional()
    @IsInt()
    @Min(1)
    lowStockThreshold?: number;

    // GST toggle — enables GST features for the organization
    @IsOptional()
    @IsBoolean()
    gstEnabled?: boolean;

    // Loyalty tier settings — which customer metric drives the tier, and the
    // minimum value for each of the four non-NONE tiers. The four thresholds
    // must be sent together, strictly ascending, and — when loyaltyMetric is
    // ORDERS — whole integers (see LoyaltyConsistent for the full rules).
    @IsOptional()
    @IsEnum(LoyaltyMetric)
    loyaltyMetric?: LoyaltyMetric;

    @IsOptional()
    @IsNumber()
    @Min(0.01)
    @LoyaltyConsistent()
    loyaltyBronzeMin?: number;

    @IsOptional()
    @IsNumber()
    @Min(0.01)
    loyaltySilverMin?: number;

    @IsOptional()
    @IsNumber()
    @Min(0.01)
    loyaltyGoldMin?: number;

    @IsOptional()
    @IsNumber()
    @Min(0.01)
    loyaltyPlatinumMin?: number;
}
