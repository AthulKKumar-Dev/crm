import { Prisma } from '@prisma/client';

/**
 * Spread a delivery charge across the taxable lines of an order.
 *
 * WHY. Under Indian GST, delivery charged on a taxable supply is normally a
 * COMPOSITE SUPPLY: it takes the rate of the principal supply rather than being
 * tax-free. This module added shipping to the grand total untaxed, so every
 * shipped order under-declared output tax and shipping revenue never appeared
 * in GSTR-3B 3.1(a) taxable value at all.
 *
 * Apportioned pro-rata by taxable value across TAXABLE lines only — an exempt
 * or nil-rated line must not acquire tax through its share of the delivery
 * charge. When no line is taxable there is nothing to attach the charge to, and
 * the caller leaves shipping untaxed.
 *
 * ⚠️ This changes tax charged on a real transaction, which is why it sits
 * behind a per-org setting that defaults OFF. For a Shopify order the customer
 * was already charged at checkout, so enabling it before the store's own
 * shipping-tax setting matches will make the invoice declare more than was
 * collected — correctly flagged by the Phase 1 reconciliation, but surprising.
 */
export interface ApportionableLine {
    /** Taxable value before any shipping share. */
    taxableValue: number;
    /** A zero-rate line still counts as taxable; an exempt one does not. */
    taxable: boolean;
}

/**
 * Returns the shipping amount to add to each line, index-aligned with `lines`.
 *
 * The parts always sum EXACTLY to `shipping`: the rounding remainder goes to
 * the largest share (ties to the first such line — arbitrary but deterministic),
 * so a ₹100 charge over three equal lines is 33.34 / 33.33 / 33.33 rather than
 * three 33.33s that quietly lose a paisa off the invoice.
 */
export function apportionShipping(
    lines: ApportionableLine[],
    shipping: number,
): number[] {
    const parts = lines.map(() => 0);
    const total = new Prisma.Decimal(shipping);

    if (total.lessThanOrEqualTo(0)) return parts;

    const taxableIdx = lines
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => l.taxable && l.taxableValue > 0)
        .map(({ i }) => i);

    // Nothing taxable to attach the charge to. The caller leaves it untaxed
    // rather than inventing a rate for it.
    if (taxableIdx.length === 0) return parts;

    const base = taxableIdx.reduce(
        (sum, i) => sum.plus(new Prisma.Decimal(lines[i].taxableValue)),
        new Prisma.Decimal(0),
    );
    if (base.lessThanOrEqualTo(0)) return parts;

    let allocated = new Prisma.Decimal(0);
    let largestIdx = taxableIdx[0];

    for (const i of taxableIdx) {
        const share = total
            .times(new Prisma.Decimal(lines[i].taxableValue))
            .dividedBy(base)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

        parts[i] = share.toNumber();
        allocated = allocated.plus(share);

        if (lines[i].taxableValue > lines[largestIdx].taxableValue) largestIdx = i;
    }

    // Give the rounding remainder (positive or negative) to the largest line,
    // so the apportioned parts reconcile exactly with the charge.
    const remainder = total.minus(allocated);
    if (!remainder.isZero()) {
        parts[largestIdx] = new Prisma.Decimal(parts[largestIdx])
            .plus(remainder)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
            .toNumber();
    }

    return parts;
}
