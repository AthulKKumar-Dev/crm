import {
  extractStateCodeFromGstin,
  GST_RATE_SLABS,
  isGstRateSlab,
  isValidGstin,
  normalizeGstin,
} from './gst-rates';

/**
 * A GSTIN that is accepted but malformed classifies an invoice as B2B, and the
 * portal then rejects the whole return. A state code sliced blindly off a
 * non-GSTIN becomes a place of supply, which decides CGST+SGST vs IGST — the
 * tax head printed on a statutory document.
 */
describe('isValidGstin', () => {
  it('accepts a well-formed GSTIN', () => {
    expect(isValidGstin('27AABCU9603R1ZM')).toBe(true);
  });

  it('accepts one with stray case or whitespace', () => {
    expect(isValidGstin('  27aabcu9603r1zm ')).toBe(true);
  });

  it('rejects the near-misses that actually occur', () => {
    expect(isValidGstin('27AABCU9603R1Z')).toBe(false); // 14 chars
    expect(isValidGstin('27AABCU9603R1ZMX')).toBe(false); // 16 chars
    expect(isValidGstin('AABCU9603R1ZM27')).toBe(false); // transposed
    expect(isValidGstin('27AABCU9603R1AM')).toBe(false); // no Z in slot 14
    expect(isValidGstin('')).toBe(false);
    expect(isValidGstin(null)).toBe(false);
    expect(isValidGstin(undefined)).toBe(false);
  });
});

describe('normalizeGstin', () => {
  it('returns the canonical stored form', () => {
    expect(normalizeGstin(' 27aabcu9603r1zm ')).toBe('27AABCU9603R1ZM');
  });

  it('returns null for anything that is not a GSTIN', () => {
    // This is what keeps `buyerGstin` meaning "valid GSTIN or null", so the
    // in-memory B2B test and the Prisma `{ not: null }` filter agree.
    expect(normalizeGstin('garbage')).toBeNull();
    expect(normalizeGstin('')).toBeNull();
  });
});

describe('extractStateCodeFromGstin', () => {
  it('takes the state code from a real GSTIN', () => {
    expect(extractStateCodeFromGstin('27AABCU9603R1ZM')).toBe('27');
  });

  it('returns null rather than slicing a non-GSTIN', () => {
    // The old bare substring(0, 2) returned "ga" here and fed it into
    // place-of-supply resolution as if it were a state code.
    expect(extractStateCodeFromGstin('garbage')).toBeNull();
    expect(extractStateCodeFromGstin('')).toBeNull();
    expect(extractStateCodeFromGstin(null)).toBeNull();
  });
});

describe('isGstRateSlab', () => {
  it('accepts the slabs a merchant can legally charge', () => {
    expect(isGstRateSlab(0)).toBe(true);
    expect(isGstRateSlab(5)).toBe(true);
    expect(isGstRateSlab(12)).toBe(true);
    expect(isGstRateSlab(18)).toBe(true);
    expect(isGstRateSlab(28)).toBe(true);
  });

  it('accepts the two slabs that were missing from the constant', () => {
    // 3% is gold/silver/jewellery and 0.25% is rough diamonds. Both are real,
    // and enforcing the old five-entry list would have made those merchants
    // unable to save their correct rate.
    expect(isGstRateSlab(3)).toBe(true);
    expect(isGstRateSlab(0.25)).toBe(true);
    expect(GST_RATE_SLABS).toContain(3);
    expect(GST_RATE_SLABS).toContain(0.25);
  });

  it('rejects a rate that matches no slab', () => {
    expect(isGstRateSlab(7.5)).toBe(false);
    expect(isGstRateSlab(17)).toBe(false);
    expect(isGstRateSlab(-5)).toBe(false);
  });
});
