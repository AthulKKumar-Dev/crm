import { Prisma } from '@prisma/client';

/**
 * Read the tax a sales channel reports it charged.
 *
 * NULL vs ZERO IS LOAD-BEARING and the whole reason these return
 * `Decimal | null` rather than defaulting to 0:
 *
 *   null  — the payload did not tell us (an older sync, an offline order, a
 *           webhook topic that omits the field).
 *   0.00  — the channel told us it charged no tax.
 *
 * The invoice reconciliation flags a divergence between declared and charged
 * tax. Collapsing "not told" into 0 would make every historical and every
 * offline invoice look like a zero-tax sale the CRM disagreed with, and the
 * flag would be pure noise from the day it shipped.
 */

interface RawTaxLine {
    price?: unknown;
    priceSet?: { shopMoney?: { amount?: unknown } };
    price_set?: { shop_money?: { amount?: unknown } };
}

function amountOf(line: RawTaxLine): Prisma.Decimal | null {
    // GraphQL gives priceSet.shopMoney.amount; REST webhooks give a bare
    // `price` string, and sometimes price_set.shop_money.amount.
    const raw =
        line?.priceSet?.shopMoney?.amount ??
        line?.price_set?.shop_money?.amount ??
        line?.price;

    if (raw === null || raw === undefined || raw === '') return null;

    try {
        return new Prisma.Decimal(raw as Prisma.Decimal.Value);
    } catch {
        return null;
    }
}

/**
 * Total of a `tax_lines` array.
 *
 * Returns null when the key is absent entirely; returns Decimal(0) for an empty
 * array, because an empty array IS a statement that no tax was charged.
 */
export function sumTaxLines(taxLines: unknown): Prisma.Decimal | null {
    if (taxLines === null || taxLines === undefined) return null;
    if (!Array.isArray(taxLines)) return null;

    return taxLines.reduce<Prisma.Decimal>(
        (sum, line) => sum.plus(amountOf(line as RawTaxLine) ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
    );
}

/**
 * Shipping tax from an order payload, across however many shipping lines it
 * carries. Null when the payload says nothing about shipping lines.
 */
export function extractShippingTax(
    so: { shipping_lines?: unknown } | null | undefined,
): { amount: Prisma.Decimal; lines: unknown[] } | null {
    const shippingLines = so?.shipping_lines;
    if (!Array.isArray(shippingLines)) return null;

    const collected: unknown[] = [];
    let amount = new Prisma.Decimal(0);

    for (const line of shippingLines) {
        const taxLines = (line as { tax_lines?: unknown })?.tax_lines;
        if (!Array.isArray(taxLines)) continue;
        collected.push(...taxLines);
        amount = amount.plus(sumTaxLines(taxLines) ?? new Prisma.Decimal(0));
    }

    return { amount, lines: collected };
}
