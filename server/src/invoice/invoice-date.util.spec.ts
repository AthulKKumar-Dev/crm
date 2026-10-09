import { resolveSupplyDate } from './invoice-date.util';

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
