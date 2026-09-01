export interface IndianState {
  code: string;
  name: string;
  unionTerritory: boolean;
}

export const INDIAN_STATES: IndianState[] = [
  { code: '01', name: 'Jammu & Kashmir', unionTerritory: true },
  { code: '02', name: 'Himachal Pradesh', unionTerritory: false },
  { code: '03', name: 'Punjab', unionTerritory: false },
  { code: '04', name: 'Chandigarh', unionTerritory: true },
  { code: '05', name: 'Uttarakhand', unionTerritory: false },
  { code: '06', name: 'Haryana', unionTerritory: false },
  { code: '07', name: 'Delhi', unionTerritory: true },
  { code: '08', name: 'Rajasthan', unionTerritory: false },
  { code: '09', name: 'Uttar Pradesh', unionTerritory: false },
  { code: '10', name: 'Bihar', unionTerritory: false },
  { code: '11', name: 'Sikkim', unionTerritory: false },
  { code: '12', name: 'Arunachal Pradesh', unionTerritory: false },
  { code: '13', name: 'Nagaland', unionTerritory: false },
  { code: '14', name: 'Manipur', unionTerritory: false },
  { code: '15', name: 'Mizoram', unionTerritory: false },
  { code: '16', name: 'Tripura', unionTerritory: false },
  { code: '17', name: 'Meghalaya', unionTerritory: false },
  { code: '18', name: 'Assam', unionTerritory: false },
  { code: '19', name: 'West Bengal', unionTerritory: false },
  { code: '20', name: 'Jharkhand', unionTerritory: false },
  { code: '21', name: 'Odisha', unionTerritory: false },
  { code: '22', name: 'Chhattisgarh', unionTerritory: false },
  { code: '23', name: 'Madhya Pradesh', unionTerritory: false },
  { code: '24', name: 'Gujarat', unionTerritory: false },
  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu', unionTerritory: true },
  { code: '27', name: 'Maharashtra', unionTerritory: false },
  { code: '28', name: 'Andhra Pradesh (Old)', unionTerritory: false },
  { code: '29', name: 'Karnataka', unionTerritory: false },
  { code: '30', name: 'Goa', unionTerritory: false },
  { code: '31', name: 'Lakshadweep', unionTerritory: true },
  { code: '32', name: 'Kerala', unionTerritory: false },
  { code: '33', name: 'Tamil Nadu', unionTerritory: false },
  { code: '34', name: 'Puducherry', unionTerritory: true },
  { code: '35', name: 'Andaman & Nicobar Islands', unionTerritory: true },
  { code: '36', name: 'Telangana', unionTerritory: false },
  { code: '37', name: 'Andhra Pradesh', unionTerritory: false },
  { code: '38', name: 'Ladakh', unionTerritory: true },
  { code: '96', name: 'Other Country', unionTerritory: false },
  { code: '97', name: 'Other Territory', unionTerritory: false },
];

export const INDIAN_STATES_MAP = new Map(
  INDIAN_STATES.map((s) => [s.code, s]),
);

/**
 * Validate that a state code exists in the Indian states list
 */
export function isValidStateCode(code: string): boolean {
  return INDIAN_STATES_MAP.has(code);
}

/**
 * Get state name from state code
 */
export function getStateName(code: string): string | undefined {
  return INDIAN_STATES_MAP.get(code)?.name;
}

/** Place-of-supply code used when nothing could be resolved. */
/**
 * Place of supply for an export.
 *
 * '96' (Other Country) is the code the GST portal expects for a supply whose
 * destination is outside India. It is a real code on the statutory list, but it
 * was absent from INDIAN_STATES, so `isValidStateCode` rejected it and every
 * step of `resolvePlaceOfSupply` that guards on validity silently skipped it.
 */
export const EXPORT_PLACE_OF_SUPPLY = '96';

export const UNSPECIFIED_PLACE_OF_SUPPLY = '00';

/**
 * Render a place of supply as `"27 - Maharashtra"` for display and CSV export.
 *
 * Null-safe by design: the GSTR-1 B2C section groups by `Invoice.placeOfSupply`,
 * and the exporter used to interpolate the code and name directly — so a row
 * that had neither rendered as the literal string `"null - null"` in a return a
 * merchant was about to file.
 */
export function formatPlaceOfSupply(
  code: string | null | undefined,
  name?: string | null,
): string {
  const resolvedCode = code?.trim() || UNSPECIFIED_PLACE_OF_SUPPLY;
  const resolvedName =
    name?.trim() ||
    getStateName(resolvedCode) ||
    (resolvedCode === UNSPECIFIED_PLACE_OF_SUPPLY ? 'Unspecified' : 'Unknown');

  return `${resolvedCode} - ${resolvedName}`;
}
