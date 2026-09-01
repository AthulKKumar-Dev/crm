import { Prisma } from '@prisma/client';
import { sumTaxLines } from './shopify-tax-lines.util';

/**
 * Extract what a refund actually returned, tax included.
 *
 * THREE DEFECTS THIS REPLACES, all silent:
 *
 * 1. `rf.transactions?.[0]?.amount` took only the FIRST transaction. A refund
 *    settled across two tenders — part card, part store credit, which is
 *    ordinary for a partial return — was understated by the whole second leg.
 * 2. No tax was captured at all, so a refunded sale stayed 100% in declared
 *    output liability for ever.
 * 3. `order_adjustments` were ignored. Shopify reports shipping and discounts
 *    written off after the fact there rather than on refund_line_items, so a
 *    refund that gave back the delivery charge looked smaller than it was.
 *
 * NULL vs ZERO is load-bearing throughout, as it is for channel tax: null means
 * the payload never told us, zero means it told us zero. A refund synced before
 * these columns existed must not be mistaken for a tax-free refund.
 */

export interface RefundTax {
    /** Gross amount returned, across EVERY transaction. */
    amount: Prisma.Decimal;
    /** Tax component, or null when the payload carried none. */
    totalTax: Prisma.Decimal | null;
    shippingTax: Prisma.Decimal | null;
    taxLines: unknown[] | null;
    adjustments: unknown[] | null;
}

function dec(value: unknown): Prisma.Decimal | null {
    if (value === null || value === undefined || value === '') return null;
    try {
        return new Prisma.Decimal(value as Prisma.Decimal.Value);
    } catch {
        return null;
    }
}

/** Total across every settled transaction, not just the first. */
export function sumRefundTransactions(refund: any): Prisma.Decimal {
    const txs = refund?.transactions;
    if (!Array.isArray(txs)) return dec(refund?.amount) ?? new Prisma.Decimal(0);

    return txs.reduce<Prisma.Decimal>((sum, t) => {
        // Only money that actually moved back. A 'failure' or 'error' leg would
        // otherwise inflate the credit note.
        const status = String(t?.status ?? 'success').toLowerCase();
        if (status !== 'success' && status !== 'pending') return sum;
        return sum.plus(dec(t?.amount) ?? new Prisma.Decimal(0));
    }, new Prisma.Decimal(0));
}

export function extractRefundTax(refund: any): RefundTax {
    const amount = sumRefundTransactions(refund);

    const lineItems = Array.isArray(refund?.refund_line_items)
        ? refund.refund_line_items
        : null;

    // Per-line tax. Shopify gives both a scalar `total_tax` and a `tax_lines`
    // array on each refunded line; prefer the array so the rate breakdown
    // survives, and fall back to the scalar.
    let lineTax: Prisma.Decimal | null = null;
    const collectedTaxLines: unknown[] = [];

    if (lineItems) {
        // ALL-OR-NOTHING, deliberately. If even one line carries no tax
        // information, the refund's tax total is unknown rather than partial —
        // summing what we happen to have would understate the credit note and
        // present a guess as a fact. Null propagates; a partial sum does not
        // announce itself.
        let running = new Prisma.Decimal(0);
        let allKnown = true;

        for (const li of lineItems) {
            const fromLines = sumTaxLines(li?.tax_lines);
            if (Array.isArray(li?.tax_lines)) collectedTaxLines.push(...li.tax_lines);

            const known = fromLines ?? dec(li?.total_tax);
            if (known === null) {
                allKnown = false;
                break;
            }
            running = running.plus(known);
        }

        lineTax = allKnown ? running : null;
    }

    // Adjustments: shipping and discounts written off after the fact. Their tax
    // is reported separately and is genuinely part of the credit note.
    const adjustments = Array.isArray(refund?.order_adjustments)
        ? refund.order_adjustments
        : null;

    let shippingTax: Prisma.Decimal | null = null;
    if (adjustments) {
        // Reduce over a typed local: `adjustments` is `any` off the payload,
        // and calling .reduce with a type argument on an untyped value is a
        // compile error rather than the inference it looks like.
        let adjustmentTax = new Prisma.Decimal(0);
        for (const a of adjustments as unknown[]) {
            const amt = dec((a as { tax_amount?: unknown })?.tax_amount);
            if (amt) adjustmentTax = adjustmentTax.plus(amt.abs());
        }
        shippingTax = adjustmentTax;
    }

    const totalTax =
        lineTax === null && shippingTax === null
            ? null
            : (lineTax ?? new Prisma.Decimal(0)).plus(
                  shippingTax ?? new Prisma.Decimal(0),
              );

    return {
        amount,
        totalTax,
        shippingTax,
        taxLines: collectedTaxLines.length ? collectedTaxLines : null,
        adjustments,
    };
}
