import {
    registerDecorator,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import { GST_RATE_SLABS, isGstRateSlab } from '../constants/gst-rates';

/**
 * Restricts a configured GST rate to a statutory slab.
 *
 * `GST_RATE_SLABS` was declared and never enforced, so `@Min(0) @Max(28)` let an
 * arbitrary rate — 7.5%, say — be saved, reach a statutory invoice, and land in
 * a GSTR-3B rate bucket that matches no slab on the form.
 *
 * WRITE-SIDE ONLY, deliberately. There is no read-side check and no data
 * migration: an organization that already stored a non-slab rate keeps
 * invoicing correctly and meets this constraint only when it next edits that
 * rate. Retro-validating would break invoicing for those orgs with no warning.
 */
@ValidatorConstraint({ name: 'IsGstRateSlab', async: false })
export class IsGstRateSlabConstraint implements ValidatorConstraintInterface {
    validate(value: unknown): boolean {
        return typeof value === 'number' && isGstRateSlab(value);
    }

    defaultMessage(): string {
        return `gstRate must be one of the statutory GST slabs: ${GST_RATE_SLABS.join(', ')}.`;
    }
}

export function IsGstRateSlab(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName,
            options: validationOptions,
            constraints: [],
            validator: IsGstRateSlabConstraint,
        });
    };
}
