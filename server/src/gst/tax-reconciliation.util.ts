import { Prisma } from '@prisma/client';

/**
 * Compare the tax an invoice DECLARES against the tax the sales channel
 * actually COLLECTED.
 *
 * WHY THIS EXISTS. Shopify computes tax at checkout and charges the customer;
 * the CRM then recomputes tax independently from its own `StateTaxRate` /
 * `ProductTypeTaxRate` / product configuration when it issues the invoice.
 * Nothing ever compared the two. If a merchant's Shopify tax settings drift
 * from their CRM settings — different rate on a product, a collection override
 * only one side knows about, tax-inclusive pricing — the return declares a
 * different number than the money taken, silently, with no signal anywhere.
 *
 * This does NOT change what is charged or what is declared. The CRM's own
 * computation remains the invoice's value verbatim; this only makes the
 * divergence visible before the return is filed.
 */

/** Absolute floor, in rupees. Below this, per-line rounding dominates. */
export const TAX_MISMATCH_MIN_DELTA = new Prisma.Decimal(1);

/** Relative band. 0.5% absorbs rounding across many lines without absorbing a
 *  real rate error — the smallest slab gap (5% vs 12%) is far wider. */
export const TAX_MISMATCH_RELATIVE = new Prisma.Decimal('0.005');

export interface TaxComparison {
    /** What the channel charged. Null when there was nothing to compare. */
    chargedTax: Prisma.Decimal | null;
    declaredTax: Prisma.Decimal;
    /** declared − charged, signed. Null when never compared. */
    delta: Prisma.Decimal | null;
    mismatch: boolean;
}

function toDecimal(
    value: Prisma.Decimal | number | string | null | undefined,
): Prisma.Decimal | null {
    if (value === null || value === undefined) return null;
    try {
        return new Prisma.Decimal(value as Prisma.Decimal.Value);
    } catch {
        return null;
    }
}

export function compareTax(
    chargedTax: Prisma.Decimal | number | string | null | undefined,
    declaredTax: Prisma.Decimal | number | string,
): TaxComparison {
    const declared = toDecimal(declaredTax) ?? new Prisma.Decimal(0);
    const charged = toDecimal(chargedTax);

    // Never compared is NOT the same as compared-and-equal. Offline orders have
    // no independent channel figure, and neither does any order that predates
    // the columns — flagging those would make the signal useless on day one.
    if (charged === null) {
        return { chargedTax: null, declaredTax: declared, delta: null, mismatch: false };
    }

    const delta = declared.minus(charged);
    const tolerance = Prisma.Decimal.max(
        TAX_MISMATCH_MIN_DELTA,
        charged.abs().times(TAX_MISMATCH_RELATIVE),
    );

    return {
        chargedTax: charged,
        declaredTax: declared,
        delta,
        mismatch: delta.abs().greaterThan(tolerance),
    };
}
