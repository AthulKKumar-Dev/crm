import { isWithinInvoicingWindow, resolveSupplyDate } from './invoice-date.util';

describe('resolveSupplyDate', () => {
  const now = new Date('2026-10-08T09:00:00.000Z');

  it('prefers the channel timestamp over the CRM row timestamp', () => {
    const externalCreatedAt = new Date('2026-09-25T10:00:00.000Z');
    const createdAt = new Date('2026-10-01T00:00:00.000Z');
    expect(resolveSupplyDate({ externalCreatedAt, createdAt }, now)).toBe(
      externalCreatedAt,
    );
  });

  it('falls back to createdAt for CRM-native orders', () => {
    const createdAt = new Date('2026-09-25T10:00:00.000Z');
    expect(resolveSupplyDate({ externalCreatedAt: null, createdAt }, now)).toBe(
      createdAt,
    );
  });

  it('never dates a document in the future', () => {
    const ahead = new Date('2026-10-09T00:00:00.000Z');
    expect(
      resolveSupplyDate({ externalCreatedAt: ahead, createdAt: ahead }, now),
    ).toBe(now);
  });
});

describe('isWithinInvoicingWindow', () => {
  const IST = 'Asia/Kolkata';
  const now = new Date('2026-10-08T09:00:00.000Z'); // 8 Oct IST

  it('accepts the current month and the previous one', () => {
    expect(isWithinInvoicingWindow(new Date('2026-10-01T00:00:00.000Z'), now, IST)).toBe(true);
    expect(isWithinInvoicingWindow(new Date('2026-09-25T10:00:00.000Z'), now, IST)).toBe(true);
    expect(isWithinInvoicingWindow(new Date('2026-09-01T10:00:00.000Z'), now, IST)).toBe(true);
  });

  it('rejects anything two or more months back', () => {
    expect(isWithinInvoicingWindow(new Date('2026-08-31T10:00:00.000Z'), now, IST)).toBe(false);
    expect(isWithinInvoicingWindow(new Date('2025-10-08T09:00:00.000Z'), now, IST)).toBe(false);
  });

  it('decides the month in the org timezone, not UTC', () => {
    // 31 Aug 18:30Z is already 1 Sep 00:00 IST — inside the window.
    expect(isWithinInvoicingWindow(new Date('2026-08-31T18:30:00.000Z'), now, IST)).toBe(true);
    expect(isWithinInvoicingWindow(new Date('2026-08-31T18:29:59.000Z'), now, IST)).toBe(false);
  });

  it('spans a year boundary', () => {
    const jan = new Date('2027-01-05T09:00:00.000Z');
    expect(isWithinInvoicingWindow(new Date('2026-12-20T09:00:00.000Z'), jan, IST)).toBe(true);
    expect(isWithinInvoicingWindow(new Date('2026-11-30T09:00:00.000Z'), jan, IST)).toBe(false);
  });
});
