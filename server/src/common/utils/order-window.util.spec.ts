import { OrderFinancialStatus } from '@prisma/client';
import {
  SALES_FINANCIAL_STATUSES,
  placedBetween,
  salesOrderWhere,
} from './order-window.util';

/**
 * The filters every dashboard figure shares.
 *
 * These are one-liners, but they encode the two mistakes that made Total Sales
 * and Total Profit irreconcilable: a date filter that silently dropped every
 * CRM-native order, and a revenue filter that counted cancelled orders. Both
 * are invisible in a code review and obvious in a test.
 */

const FROM = new Date('2026-01-01T00:00:00.000Z');
const TO = new Date('2026-02-01T00:00:00.000Z');

describe('placedBetween', () => {
  it('matches storefront orders on their own timestamp', () => {
    const where = placedBetween(FROM, TO);

    expect(where.OR).toContainEqual({
      externalCreatedAt: { gte: FROM, lt: TO },
    });
  });

  it('falls back to createdAt for orders with no external timestamp', () => {
    // A bare `externalCreatedAt: { gte }` never matches a NULL, so without this
    // branch every manual/offline sale disappears from the window while an
    // order-level _sum over the same period still counts it.
    const where = placedBetween(FROM, TO);

    expect(where.OR).toContainEqual({
      externalCreatedAt: null,
      createdAt: { gte: FROM, lt: TO },
    });
  });

  it('bounds the window exclusively at the top so adjacent buckets cannot both claim a row', () => {
    const where = placedBetween(FROM, TO);

    for (const branch of where.OR as Array<Record<string, any>>) {
      const range = branch.externalCreatedAt ?? branch.createdAt;
      expect(range).toEqual({ gte: FROM, lt: TO });
    }
  });

  it('leaves the window open-ended when no end is given', () => {
    const where = placedBetween(FROM);

    expect(where.OR).toContainEqual({ externalCreatedAt: { gte: FROM } });
    expect(where.OR).toContainEqual({
      externalCreatedAt: null,
      createdAt: { gte: FROM },
    });
  });
});

describe('salesOrderWhere', () => {
  const scope = { orgId: 'org_1', from: FROM, to: TO };

  it('excludes cancelled orders', () => {
    // A cancelled but still-PAID order had its units restocked, so it is
    // neither revenue nor COGS. Nothing filtered it before.
    expect(salesOrderWhere(scope).cancelledAt).toBeNull();
  });

  it('excludes soft-deleted orders and scopes to the organization', () => {
    const where = salesOrderWhere(scope);

    expect(where.deletedAt).toBeNull();
    expect(where.organizationId).toBe('org_1');
  });

  it('counts partially refunded orders — the unrefunded remainder is still revenue', () => {
    expect(SALES_FINANCIAL_STATUSES).toContain(OrderFinancialStatus.PARTIALLY_REFUNDED);
  });

  it('never counts fully refunded or voided orders', () => {
    expect(SALES_FINANCIAL_STATUSES).not.toContain(OrderFinancialStatus.REFUNDED);
    expect(SALES_FINANCIAL_STATUSES).not.toContain(OrderFinancialStatus.VOIDED);
  });

  it('carries the NULL-safe date window through', () => {
    expect(salesOrderWhere(scope).OR).toContainEqual({
      externalCreatedAt: null,
      createdAt: { gte: FROM, lt: TO },
    });
  });

  it('only narrows by channel when one is given', () => {
    expect(salesOrderWhere(scope).channelId).toBeUndefined();
    expect(salesOrderWhere({ ...scope, channelId: 'ch_1' }).channelId).toBe('ch_1');
  });
});
