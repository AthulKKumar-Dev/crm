import { extractStateFromAddress } from '../gst/place-of-supply.util';

/**
 * A warehouse can be declared an ADDITIONAL PLACE OF BUSINESS (APOB) of one GST
 * registration. GST registers per STATE: one GSTIN covers a principal place of
 * business plus any number of additional places WITHIN THAT STATE. A godown in
 * another state is not an APOB of this registration at all — it needs its own.
 *
 * So the link is only valid when the warehouse's address resolves to the
 * registration's state. Returns the reason it is invalid, or null when the pair
 * is acceptable.
 *
 * SILENT ON MISSING FACTS, deliberately. No registration means "not linked",
 * which is always allowed. An address we cannot resolve a state from is not
 * evidence of a mismatch — merchants type partial addresses, and refusing them
 * would block the ordinary case of entering a name and code first, an address
 * later. The mismatch has to be positively provable to be reported.
 */
export function warehouseGstinMismatch(
  address: unknown,
  gstin: { stateCode: string; stateName: string } | null | undefined,
): string | null {
  if (!gstin) return null;

  const addressState = extractStateFromAddress(address);
  if (!addressState) return null;

  if (addressState === gstin.stateCode) return null;

  return (
    `This address is in state ${addressState}, but the GST registration is for ` +
    `${gstin.stateName} (${gstin.stateCode}). A place of business in another ` +
    `state needs its own GST registration.`
  );
}
