import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import { LoyaltyMetric } from '@prisma/client';
import type { UpdateOrganizationDto } from '../dto/update-organization.dto';

/**
 * Client-side guard: when any loyalty threshold is present, all four tiers
 * must be supplied together AND sorted strictly ascending.
 *
 * Additionally, when `loyaltyMetric === ORDERS`, thresholds must be whole
 * integers — you can't have half an order. TOTAL_SPENT allows fractional
 * money (e.g. 99.99). The underlying column is still Decimal(12,2) so the
 * merchant can flip metric without a schema migration.
 */
@ValidatorConstraint({ name: 'LoyaltyConsistent', async: false })
export class LoyaltyConsistentConstraint implements ValidatorConstraintInterface {
    validate(_value: unknown, args: ValidationArguments): boolean {
        const dto = args.object as UpdateOrganizationDto;
        const fields = [
            dto.loyaltyBronzeMin,
            dto.loyaltySilverMin,
            dto.loyaltyGoldMin,
            dto.loyaltyPlatinumMin,
        ];
        const presentCount = fields.filter((f) => f !== undefined).length;

        // If no loyalty threshold is being updated, nothing to check here.
        if (presentCount === 0) return true;

        // Partial threshold updates are rejected: the DTO has no way to know
        // the stored values, so merchants must send all four together.
        if (presentCount !== 4) return false;

        const [bronze, silver, gold, platinum] = fields as number[];
        if (!(bronze > 0)) return false;
        if (!(bronze < silver)) return false;
        if (!(silver < gold)) return false;
        if (!(gold < platinum)) return false;

        // Integer-only thresholds when the metric is ORDERS.
        if (dto.loyaltyMetric === LoyaltyMetric.ORDERS) {
            if (!Number.isInteger(bronze)) return false;
            if (!Number.isInteger(silver)) return false;
            if (!Number.isInteger(gold)) return false;
            if (!Number.isInteger(platinum)) return false;
        }
        return true;
    }

    defaultMessage(args: ValidationArguments): string {
        const dto = args.object as UpdateOrganizationDto;
        const values = [
            dto.loyaltyBronzeMin,
            dto.loyaltySilverMin,
            dto.loyaltyGoldMin,
            dto.loyaltyPlatinumMin,
        ];
        const present = values.filter((f) => f !== undefined).length;
        if (present !== 4) {
            return 'Loyalty thresholds must be sent together (bronze, silver, gold, platinum).';
        }
        const hasNonInteger = values.some((v) => v !== undefined && !Number.isInteger(v));
        if (dto.loyaltyMetric === LoyaltyMetric.ORDERS && hasNonInteger) {
            return 'Order-based thresholds must be whole numbers (no decimals).';
        }
        return 'Loyalty thresholds must be strictly ascending: bronze < silver < gold < platinum (all > 0).';
    }
}

export function LoyaltyConsistent(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName,
            options: validationOptions,
            constraints: [],
            validator: LoyaltyConsistentConstraint,
        });
    };
}
