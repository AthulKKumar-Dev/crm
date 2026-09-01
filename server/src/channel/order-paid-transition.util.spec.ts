import { OrderFinancialStatus } from '@prisma/client';
import { becamePaid } from './order-paid-transition.util';

/**
 * The gate that decides whether a Shopify webhook auto-issues a GST invoice.
 *
 * Worth testing in isolation because both false directions are expensive: a
 * false positive consumes a statutory invoice number that cannot be reused, and
 * a false negative silently leaves a paid order un-invoiced.
 */
describe('becamePaid', () => {
  const {
    PAID,
    PENDING,
    AUTHORIZED,
    PARTIALLY_PAID,
    PARTIALLY_REFUNDED,
    REFUNDED,
    VOIDED,
  } = OrderFinancialStatus;

  describe('new order (no prior state)', () => {
    it('fires when the order arrives already paid', () => {
      expect(becamePaid(null, PAID)).toBe(true);
    });

    it('does not fire when the order arrives unpaid', () => {
      expect(becamePaid(null, PENDING)).toBe(false);
      expect(becamePaid(null, AUTHORIZED)).toBe(false);
      expect(becamePaid(null, PARTIALLY_PAID)).toBe(false);
    });
  });

  describe('existing order', () => {
    it('fires on the edge into paid', () => {
      expect(becamePaid(PENDING, PAID)).toBe(true);
      expect(becamePaid(AUTHORIZED, PAID)).toBe(true);
      expect(becamePaid(PARTIALLY_PAID, PAID)).toBe(true);
    });

    // Shopify redelivers webhooks freely, and orders/updated fires for
    // fulfillment and tag changes too. Testing state rather than the edge would
    // re-issue on every one of them.
    it('does not re-fire on a payload that leaves it paid', () => {
      expect(becamePaid(PAID, PAID)).toBe(false);
    });

    it('does not fire when money moves back out', () => {
      expect(becamePaid(PAID, REFUNDED)).toBe(false);
      expect(becamePaid(PAID, PARTIALLY_REFUNDED)).toBe(false);
      expect(becamePaid(PAID, VOIDED)).toBe(false);
    });

    // A refunded order that is paid again is a genuine second supply, and the
    // cancel-then-reissue flow is what handles the paperwork. The one-live-
    // invoice check is the backstop if an invoice is somehow still open.
    it('fires again after a refund returns to paid', () => {
      expect(becamePaid(REFUNDED, PAID)).toBe(true);
    });

    it('ignores transitions that never reach paid', () => {
      expect(becamePaid(PENDING, AUTHORIZED)).toBe(false);
      expect(becamePaid(PENDING, VOIDED)).toBe(false);
      expect(becamePaid(AUTHORIZED, PARTIALLY_PAID)).toBe(false);
    });
  });
});
