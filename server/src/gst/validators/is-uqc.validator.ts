import {
    registerDecorator,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import { DEFAULT_UQC, isUqcCode } from '../constants/uqc';

/**
 * Restricts a unit of measure to a GST portal UQC.
 *
 * `UQC_CODES` is the portal's own closed list, and GSTR-1 table 12 is rejected
 * outright for a unit outside it. The product and variant write paths carried
 * only `@IsString() @MaxLength(10)`, so anything at all could be stored — and
 * `normalizeUqc` then SILENTLY DISCARDED it at invoice time and fell back to the
 * org default. The merchant saw their choice accepted, and a different unit
 * appeared on the return, with nothing anywhere reporting a problem.
 *
 * Case-insensitive: the value is uppercased before the check, and the write
 * paths canonicalise with `normalizeUqc` so what is stored matches what is
 * validated here.
 *
 * WRITE-SIDE ONLY, like IsGstRateSlab. Rows already holding an off-list unit
 * keep working and are corrected the next time that product is edited.
 */
@ValidatorConstraint({ name: 'IsUqc', async: false })
export class IsUqcConstraint implements ValidatorConstraintInterface {
    validate(value: unknown): boolean {
        if (typeof value !== 'string') return false;
        return isUqcCode(value.trim().toUpperCase());
    }

    defaultMessage(): string {
        return `unitOfMeasure must be a GST unit quantity code (UQC), e.g. ${DEFAULT_UQC}, PCS, KGS.`;
    }
}

export function IsUqc(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName,
            options: validationOptions,
            constraints: [],
            validator: IsUqcConstraint,
        });
    };
}
