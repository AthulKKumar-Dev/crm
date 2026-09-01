import {
    registerDecorator,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import { isValidFinancialYear } from '../utils/zoned-date.util';

/**
 * Accepts an Indian financial year in `YYYY-YY` form whose halves agree — so
 * "2025-26" passes and "2025-99" does not.
 *
 * Without this, `gstPeriodRange` threw a bare `Error` on a malformed value and
 * NestJS surfaced it as a **500**. A mistyped year in a URL is a client mistake
 * and must read as one.
 */
@ValidatorConstraint({ name: 'IsFinancialYear', async: false })
export class IsFinancialYearConstraint implements ValidatorConstraintInterface {
    validate(value: unknown): boolean {
        return typeof value === 'string' && isValidFinancialYear(value);
    }

    defaultMessage(): string {
        return 'financialYear must be an Indian financial year like "2025-26".';
    }
}

export function IsFinancialYear(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName,
            options: validationOptions,
            constraints: [],
            validator: IsFinancialYearConstraint,
        });
    };
}
