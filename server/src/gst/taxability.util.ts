/**
 * Whether a sale line attracts GST at all.
 *
 * `OrderLineItem.taxable` and `ProductVariant.taxable` both exist, both default
 * `true`, and until now NO tax path read either — so a line explicitly marked
 * non-taxable was still taxed at the resolved rate, on the order and on the
 * statutory invoice.
 *
 * SEMANTICS: `false` on EITHER flag exempts the line. Absent or null means
 * taxable, matching the column default — deliberately not "both must be true",
 * because a Shopify line whose variant relation did not resolve would then be
 * silently exempted, turning a data-loading gap into an under-declaration.
 */
export interface LineTaxabilityInput {
    /** OrderLineItem.taxable / DraftOrderLineItem.taxable */
    lineTaxable?: boolean | null;
    /** ProductVariant.taxable */
    variantTaxable?: boolean | null;
}

export function isLineTaxable(input: LineTaxabilityInput): boolean {
    if (input.lineTaxable === false) return false;
    if (input.variantTaxable === false) return false;
    return true;
}
