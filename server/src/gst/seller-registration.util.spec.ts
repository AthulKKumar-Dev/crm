import { GstType } from '@prisma/client';
import {
  gstTypeForSupply,
  sellerStateForSupply,
  type SellerRegistrations,
} from './seller-registration.util';

/**
 * If this disagrees with the seller-GSTIN auto-selection in
 * `InvoiceService.createForOrderTx`, a multi-GSTIN merchant gets an order
 * stamped IGST and an invoice for that same sale computed as CGST+SGST — two
 * different tax heads on one transaction, one of them printed on a statutory
 * document.
 */
const multiState: SellerRegistrations = {
  defaultStateCode: '27', // Maharashtra
  stateCodes: ['27', '29'], // + Karnataka
};

describe('sellerStateForSupply', () => {
  it('supplies from the destination registration when the org holds one', () => {
    expect(sellerStateForSupply(multiState, '29')).toBe('29');
  });

  it('falls back to the default registration otherwise', () => {
    expect(sellerStateForSupply(multiState, '24')).toBe('27');
  });

  it('returns null when the org has no registration', () => {
    expect(
      sellerStateForSupply({ defaultStateCode: null, stateCodes: [] }, '29'),
    ).toBeNull();
  });
});

describe('gstTypeForSupply', () => {
  it('is intra-state when supplying into a state the org is registered in', () => {
    // Registered in Karnataka, supplying to Karnataka — a local supply from
    // that registration, not an inter-state one from Maharashtra.
    expect(gstTypeForSupply(multiState, '29')).toBe(GstType.CGST_SGST);
  });

  it('is intra-state for the default registration supplying its own state', () => {
    expect(gstTypeForSupply(multiState, '27')).toBe(GstType.CGST_SGST);
  });

  it('is inter-state when supplying into a state the org is not registered in', () => {
    expect(gstTypeForSupply(multiState, '24')).toBe(GstType.IGST);
  });

  it('decides nothing when there is no registration or no place of supply', () => {
    // Null is the value Order.gstType already holds for non-GST orgs; it must
    // not collapse to a head just because a code was asked for.
    expect(
      gstTypeForSupply({ defaultStateCode: null, stateCodes: [] }, '29'),
    ).toBeNull();
    expect(gstTypeForSupply(multiState, null)).toBeNull();
    expect(gstTypeForSupply(multiState, undefined)).toBeNull();
  });
});
