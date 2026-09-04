import { IsUqcConstraint } from './is-uqc.validator';

/**
 * The portal rejects table 12 outright for a unit outside its own list, and the
 * previous `@IsString()` let anything through — to be silently discarded at
 * invoice time. These cases pin the boundary.
 */
describe('IsUqcConstraint', () => {
    const validator = new IsUqcConstraint();

    it('accepts a portal UQC', () => {
        expect(validator.validate('NOS')).toBe(true);
        expect(validator.validate('PCS')).toBe(true);
        expect(validator.validate('KGS')).toBe(true);
    });

    it('accepts a lowercase or padded code — the write path canonicalises it', () => {
        expect(validator.validate('nos')).toBe(true);
        expect(validator.validate('  kgs  ')).toBe(true);
    });

    it('rejects a plausible-looking unit that is not on the portal list', () => {
        // The exact value the client used to offer: the portal has KLR and MLT.
        expect(validator.validate('LTR')).toBe(false);
        expect(validator.validate('EACH')).toBe(false);
    });

    it('rejects non-strings', () => {
        expect(validator.validate(undefined)).toBe(false);
        expect(validator.validate(null)).toBe(false);
        expect(validator.validate(12)).toBe(false);
    });
});
