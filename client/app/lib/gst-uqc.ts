import type { GstSupplyType } from "~/types/api";

/**
 * Unit quantity codes the GST portal accepts.
 *
 * Deliberately the common subset rather than all 46 — a merchant picking a unit
 * should not scroll past BOU (billions of units) or GGK (great gross). The
 * server validates against the full statutory list, so nothing here is a cap on
 * what can be stored.
 *
 * Shared by the GST return settings and the product tax section so both offer
 * the same list.
 */
export const COMMON_UQC = [
  { code: "NOS", label: "NOS — Numbers" },
  { code: "PCS", label: "PCS — Pieces" },
  { code: "KGS", label: "KGS — Kilograms" },
  { code: "GMS", label: "GMS — Grams" },
  { code: "LTR", label: "LTR — Litres" },
  { code: "MLT", label: "MLT — Millilitres" },
  { code: "MTR", label: "MTR — Metres" },
  { code: "SQF", label: "SQF — Square feet" },
  { code: "SQM", label: "SQM — Square metres" },
  { code: "BOX", label: "BOX — Box" },
  { code: "PAC", label: "PAC — Packs" },
  { code: "SET", label: "SET — Sets" },
  { code: "DOZ", label: "DOZ — Dozens" },
  { code: "PRS", label: "PRS — Pairs" },
  { code: "TON", label: "TON — Tonnes" },
  { code: "OTH", label: "OTH — Others" },
];

/**
 * Statutory GST rate slabs. Must stay in step with GST_RATE_SLABS on the
 * server, which enforces this set on write — a free-text rate like 7.5 is
 * rejected there, so the product forms offer only these.
 */
export const GST_RATE_OPTIONS = ["0", "0.25", "3", "5", "12", "18", "28"];

export const GST_SUPPLY_TYPES: Array<{ value: GstSupplyType; label: string }> = [
  { value: "TAXABLE", label: "Taxable" },
  { value: "EXEMPT", label: "Exempt" },
  { value: "NIL_RATED", label: "Nil rated" },
  { value: "NON_GST", label: "Non-GST" },
  { value: "ZERO_RATED", label: "Zero rated" },
];
