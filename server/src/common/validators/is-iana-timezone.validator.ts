import {
    registerDecorator,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import { isValidTimeZone } from '../utils/zoned-date.util';

/**
 * Accepts only an IANA timezone this runtime can resolve (e.g. "Asia/Kolkata").
 *
 * `Organization.timezone` was a bare `@IsString()`, and `OrganizationService.update`
 * spreads the DTO straight through — so any string reached `Intl.DateTimeFormat`
 * inside `zonedParts` and threw `RangeError` from EVERY GST date path: returns,
 * stats, and invoice creation. One bad settings save bricked the whole tax module
 * for that organization.
 *
 * `resolveGstTimeZone` is also defensive about this (it ignores an unresolvable
 * stored value), because this decorator cannot repair rows written before it
 * existed. The two are complementary, not redundant.
 */
@ValidatorConstraint({ name: 'IsIanaTimeZone', async: false })
export class IsIanaTimeZoneConstraint implements ValidatorConstraintInterface {
    validate(value: unknown): boolean {
        return typeof value === 'string' && isValidTimeZone(value);
    }

    defaultMessage(): string {
        return 'timezone must be a valid IANA timezone name, e.g. "Asia/Kolkata".';
    }
}

export function IsIanaTimeZone(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName,
            options: validationOptions,
            constraints: [],
            validator: IsIanaTimeZoneConstraint,
        });
    };
}
