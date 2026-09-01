import { GstType } from '@prisma/client';

/**
 * Which of the seller's own GST registrations applies to a supply, and the
 * resulting tax head.
 *
 * WHY THIS IS SHARED. `InvoiceService.createForOrderTx` picks the seller GSTIN
 * by matching the place of supply first and falling back to the org default.
 * Anything else that stamps `gstType` onto an order MUST use the same rule: if
 * the Shopify sync stamped the head from the DEFAULT registration while the
 * invoice recomputed it from the AUTO-SELECTED one, a multi-GSTIN org would get
 * `order.gstType = IGST` and `invoice.gstType = CGST_SGST` on the same sale —
 * a brand-new divergence introduced by the fix for an old one.
 *
 * A merchant registered in the destination state is making a LOCAL supply from
 * that registration (CGST+SGST). One who is not is making an inter-state supply
 * from their principal place of business (IGST).
 */
export interface SellerRegistrations {
    /** stateCode of the default active GSTIN, or null when GST is off / none set. */
    defaultStateCode: string | null;
    /** stateCode of every ACTIVE GSTIN the org holds. */
    stateCodes: string[];
}

/** The seller state a supply to `placeOfSupplyCode` is made from. */
export function sellerStateForSupply(
    regs: SellerRegistrations,
    placeOfSupplyCode: string | null | undefined,
): string | null {
    if (placeOfSupplyCode && regs.stateCodes.includes(placeOfSupplyCode)) {
        return placeOfSupplyCode;
    }
    return regs.defaultStateCode;
}

/**
 * CGST+SGST vs IGST for a supply, or null when nothing can be decided —
 * GST disabled, or no active registration. Null is meaningful: it is what
 * `Order.gstType` already holds for non-GST orgs, and it must stay that way
 * rather than defaulting to a head.
 */
export function gstTypeForSupply(
    regs: SellerRegistrations,
    placeOfSupplyCode: string | null | undefined,
): GstType | null {
    const sellerState = sellerStateForSupply(regs, placeOfSupplyCode);
    if (!sellerState || !placeOfSupplyCode) return null;

    return sellerState === placeOfSupplyCode ? GstType.CGST_SGST : GstType.IGST;
}
