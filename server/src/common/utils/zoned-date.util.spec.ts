import {
  getFinancialYear,
  gstPeriodRange,
  gstQuarterForMonth,
  isValidFinancialYear,
  isValidTimeZone,
  resolveGstTimeZone,
  INDIA_TZ,
  GST_PERIOD_REGEX,
} from './zoned-date.util';

/**
 * These functions decide WHICH RETURN a sale is filed in and which financial
 * year consumes its invoice serial. Every deployment runs UTC, so if the zone
 * handling is wrong an IST merchant's first 5.5 hours of every month land in
 * the wrong return — silently, and only discoverable after filing.
 *
 * Every expected instant below is hand-computed as IST (UTC+05:30), never read
 * back from the implementation.
 */
describe('gstPeriodRange', () => {
  it('spans April in IST, not UTC', () => {
    // 2025-04-01 00:00 IST === 2025-03-31 18:30 UTC
    // 2025-05-01 00:00 IST === 2025-04-30 18:30 UTC (exclusive)
    const { from, toExclusive } = gstPeriodRange('2025-26', '04', INDIA_TZ);

    expect(from.toISOString()).toBe('2025-03-31T18:30:00.000Z');
    expect(toExclusive.toISOString()).toBe('2025-04-30T18:30:00.000Z');
  });

  it('is half-open, so the last millisecond of the month is still inside', () => {
    const { toExclusive } = gstPeriodRange('2025-26', '04', INDIA_TZ);
    const lastInstant = new Date(toExclusive.getTime() - 1);

    // 23:59:59.999 IST on 30 April — the old inclusive `23:59:59` bound
    // carried no milliseconds and dropped this.
    expect(lastInstant.toISOString()).toBe('2025-04-30T18:29:59.999Z');
  });

  it('rolls the calendar year inside the financial year for Q4', () => {
    // Quarters are FY-relative: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar.
    // So Q4 of FY 2025-26 is January to March of 2026, not 2025.
    const { from, toExclusive } = gstPeriodRange('2025-26', 'Q4', INDIA_TZ);

    expect(from.toISOString()).toBe('2025-12-31T18:30:00.000Z');
    expect(toExclusive.toISOString()).toBe('2026-03-31T18:30:00.000Z');
  });

  it('accepts a lowercase quarter, matching GST_PERIOD_REGEX', () => {
    // The DTO allows lowercase because this does; the two must not disagree,
    // or a URL that works today starts 400-ing.
    expect(GST_PERIOD_REGEX.test('q1')).toBe(true);
    expect(gstPeriodRange('2025-26', 'q1', INDIA_TZ).from.toISOString()).toBe(
      gstPeriodRange('2025-26', 'Q1', INDIA_TZ).from.toISOString(),
    );
  });

  it('rejects a period that is not a month or a quarter', () => {
    expect(() => gstPeriodRange('2025-26', '13', INDIA_TZ)).toThrow();
    expect(() => gstPeriodRange('2025-26', 'Q5', INDIA_TZ)).toThrow();
  });
});

describe('getFinancialYear', () => {
  it('puts the last millisecond of 31 March IST in the closing year', () => {
    // 2026-03-31 23:59:59.999 IST
    expect(
      getFinancialYear(new Date('2026-03-31T18:29:59.999Z'), INDIA_TZ),
    ).toBe('2025-26');
  });

  it('puts the first instant of 1 April IST in the opening year', () => {
    // 2026-04-01 00:00:00.000 IST — one millisecond later, a different FY and
    // a different invoice serial sequence.
    expect(
      getFinancialYear(new Date('2026-03-31T18:30:00.000Z'), INDIA_TZ),
    ).toBe('2026-27');
  });
});

describe('isValidFinancialYear', () => {
  it('accepts a year whose halves agree', () => {
    expect(isValidFinancialYear('2025-26')).toBe(true);
  });

  it('rejects a well-shaped year whose halves do not agree', () => {
    // The regex alone passes this — which is exactly why the regex alone is
    // not the validator.
    expect(isValidFinancialYear('2025-99')).toBe(false);
  });

  it('handles the century wrap', () => {
    expect(isValidFinancialYear('2099-00')).toBe(true);
  });

  it('rejects malformed input rather than throwing', () => {
    expect(isValidFinancialYear('2025')).toBe(false);
    expect(isValidFinancialYear('')).toBe(false);
  });
});

describe('resolveGstTimeZone', () => {
  it('honours an explicitly configured zone', () => {
    expect(resolveGstTimeZone({ timezone: 'America/New_York' })).toBe(
      'America/New_York',
    );
  });

  it('falls back to IST for a GST org left on the default UTC', () => {
    expect(resolveGstTimeZone({ timezone: 'UTC', gstEnabled: true })).toBe(
      INDIA_TZ,
    );
  });

  it('leaves a non-GST org on UTC', () => {
    expect(resolveGstTimeZone({ timezone: 'UTC', gstEnabled: false })).toBe(
      'UTC',
    );
  });

  it('ignores an unresolvable stored zone instead of throwing', () => {
    // The DTO now rejects these on write, but rows written before it existed
    // still hold garbage. Propagating it would throw RangeError out of Intl on
    // EVERY GST path for that org — returns, stats and invoice creation — so
    // this must degrade, not explode.
    expect(() =>
      resolveGstTimeZone({ timezone: 'Mars/Olympus', gstEnabled: true }),
    ).not.toThrow();
    expect(
      resolveGstTimeZone({ timezone: 'Mars/Olympus', gstEnabled: true }),
    ).toBe(INDIA_TZ);
    expect(
      resolveGstTimeZone({ timezone: 'Mars/Olympus', gstEnabled: false }),
    ).toBe('UTC');
  });
});

describe('isValidTimeZone', () => {
  it('accepts a real IANA zone and rejects a plausible fake', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('gstQuarterForMonth', () => {
  it('maps months to FINANCIAL-year quarters, not calendar ones', () => {
    // April starts the financial year, so Q1 is Apr-Jun and Q4 is Jan-Mar.
    expect(gstQuarterForMonth('04')).toBe('Q1');
    expect(gstQuarterForMonth('06')).toBe('Q1');
    expect(gstQuarterForMonth('07')).toBe('Q2');
    expect(gstQuarterForMonth('09')).toBe('Q2');
    expect(gstQuarterForMonth('10')).toBe('Q3');
    expect(gstQuarterForMonth('12')).toBe('Q3');
    expect(gstQuarterForMonth('01')).toBe('Q4');
    expect(gstQuarterForMonth('03')).toBe('Q4');
  });

  it('agrees with gstPeriodRange — a month always sits inside its own quarter', () => {
    // The lock relies on this: a June invoice must be recognised as falling in
    // a filed Q1, so the two functions cannot drift apart.
    for (const month of ['04', '06', '07', '11', '01', '03']) {
      const monthRange = gstPeriodRange('2026-27', month, 'Asia/Kolkata');
      const quarterRange = gstPeriodRange(
        '2026-27',
        gstQuarterForMonth(month),
        'Asia/Kolkata',
      );
      expect(monthRange.from.getTime()).toBeGreaterThanOrEqual(
        quarterRange.from.getTime(),
      );
      expect(monthRange.toExclusive.getTime()).toBeLessThanOrEqual(
        quarterRange.toExclusive.getTime(),
      );
    }
  });

  it('rejects a month it cannot place', () => {
    expect(() => gstQuarterForMonth('13')).toThrow();
  });
});
