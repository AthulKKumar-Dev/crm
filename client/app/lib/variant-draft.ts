import type { GstSupplyType, ProductVariant, UpdateVariantRequest } from "~/types/api";

/**
 * Every variant field editable on the product page, as typed. The page holds
 * one per variant; the Overview cards (simple products) and the variant panel
 * both edit it, and the page-level Save sends it.
 */
export type VariantDraft = {
  price: string;
  compareAtPrice: string;
  cost: string;
  sku: string;
  barcode: string;
  /** Legacy single-number stock. Never sent once warehousing is on. */
  inventoryQuantity: string;
  trackQuantity: boolean;
  continueSelling: boolean;
  taxable: boolean;
  requiresShipping: boolean;
  weight: string;
  weightUnit: string;
  hsCode: string;
  countryOfOrigin: string;
  // GST override — "" everywhere means "inherit from the product".
  gstHsnCode: string;
  gstRate: string;
  uqc: string;
  supplyType: string;
};

export const VARIANT_FIELD_LABELS: Record<keyof VariantDraft, string> = {
  price: "price",
  compareAtPrice: "compare-at",
  cost: "cost",
  sku: "SKU",
  barcode: "barcode",
  inventoryQuantity: "stock",
  trackQuantity: "track quantity",
  continueSelling: "keep selling at zero",
  taxable: "charge tax",
  requiresShipping: "shipping",
  weight: "weight",
  weightUnit: "weight unit",
  hsCode: "HS code",
  countryOfOrigin: "country of origin",
  gstHsnCode: "HSN/SAC",
  gstRate: "GST rate",
  uqc: "UQC",
  supplyType: "supply type",
};

export const VARIANT_DRAFT_KEYS = Object.keys(VARIANT_FIELD_LABELS) as Array<
  keyof VariantDraft
>;

export function toInputNumber(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? String(n) : "";
}

/** "" → null (clear the field); valid number → number; garbage → undefined (skip). */
export function toNullableNumber(input: string): number | null | undefined {
  if (!input.trim()) return null;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** GST rate as the select option string ("18", "0.25"), "" when unset. */
export function toGstRateOption(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

export function seedVariantDraft(variant: ProductVariant): VariantDraft {
  return {
    price: toInputNumber(variant.price),
    compareAtPrice: toInputNumber(variant.compareAtPrice),
    cost: toInputNumber(variant.cost),
    sku: variant.sku ?? "",
    barcode: variant.barcode ?? "",
    inventoryQuantity: toInputNumber(variant.inventoryQuantity ?? 0),
    trackQuantity: variant.trackQuantity ?? true,
    continueSelling: variant.continueSellingWhenOutOfStock ?? false,
    taxable: variant.taxable ?? true,
    requiresShipping: variant.requiresShipping ?? true,
    weight: toInputNumber(variant.weight),
    weightUnit: variant.weightUnit ?? "kg",
    hsCode: variant.hsCode ?? "",
    countryOfOrigin: variant.countryOfOrigin ?? "",
    gstHsnCode: variant.hsnCode ?? "",
    gstRate: toGstRateOption(variant.gstRate),
    uqc: variant.unitOfMeasure ?? "",
    supplyType: variant.supplyType ?? "",
  };
}

export function buildVariantDrafts(
  variants: ProductVariant[],
): Record<string, VariantDraft> {
  return Object.fromEntries(variants.map((v) => [v.id, seedVariantDraft(v)]));
}

/**
 * The fields that differ. Stock is skipped under warehousing: it is edited per
 * warehouse there, and the single-number field is never sent.
 */
export function changedVariantFields(
  base: VariantDraft,
  draft: VariantDraft,
  { warehousingEnabled }: { warehousingEnabled: boolean },
): Array<keyof VariantDraft> {
  return VARIANT_DRAFT_KEYS.filter(
    (key) =>
      base[key] !== draft[key] &&
      !(warehousingEnabled && key === "inventoryQuantity"),
  );
}

/** The PATCH body for one variant: only what changed from `base`. */
export function buildVariantPatch(
  base: VariantDraft,
  form: VariantDraft,
  { isVendor, warehousingEnabled }: { isVendor: boolean; warehousingEnabled: boolean },
): UpdateVariantRequest {
  const data: UpdateVariantRequest = {};

  if (form.price !== base.price) {
    const n = Number(form.price);
    if (form.price.trim() && Number.isFinite(n)) data.price = n;
  }
  if (form.compareAtPrice !== base.compareAtPrice) {
    const n = toNullableNumber(form.compareAtPrice);
    if (n !== undefined) data.compareAtPrice = n;
  }
  if (form.cost !== base.cost) {
    const n = toNullableNumber(form.cost);
    if (n !== undefined) data.cost = n;
  }
  if (form.sku !== base.sku) data.sku = form.sku.trim() || null;
  if (form.barcode !== base.barcode) data.barcode = form.barcode.trim() || null;
  // Under warehousing the quantity belongs to a warehouse, and the server
  // rejects it here without one — those go out as adjustments instead.
  if (!warehousingEnabled && form.inventoryQuantity !== base.inventoryQuantity) {
    const n = Number.parseInt(form.inventoryQuantity, 10);
    if (Number.isFinite(n)) data.inventoryQuantity = n;
  }
  if (form.trackQuantity !== base.trackQuantity) {
    data.trackQuantity = form.trackQuantity;
  }
  if (form.continueSelling !== base.continueSelling) {
    data.continueSellingWhenOutOfStock = form.continueSelling;
  }
  if (form.taxable !== base.taxable) data.taxable = form.taxable;
  if (form.requiresShipping !== base.requiresShipping) {
    data.requiresShipping = form.requiresShipping;
  }
  if (form.weight !== base.weight) {
    const n = toNullableNumber(form.weight);
    if (n !== undefined) data.weight = n;
  }
  // A unit with no weight is meaningless to the server, so it only travels
  // alongside one.
  if (form.weightUnit !== base.weightUnit && form.weight.trim()) {
    data.weightUnit = form.weightUnit as UpdateVariantRequest["weightUnit"];
  }
  if (form.hsCode !== base.hsCode) data.hsCode = form.hsCode.trim() || null;
  if (form.countryOfOrigin !== base.countryOfOrigin) {
    data.countryOfOrigin = form.countryOfOrigin.trim().toUpperCase() || null;
  }
  if (!isVendor) {
    // null = back to inheriting from the product.
    if (form.gstHsnCode !== base.gstHsnCode) {
      data.hsnCode = form.gstHsnCode.trim() || null;
    }
    if (form.gstRate !== base.gstRate) {
      data.gstRate = form.gstRate === "" ? null : Number(form.gstRate);
    }
    if (form.uqc !== base.uqc) data.unitOfMeasure = form.uqc || null;
    if (form.supplyType !== base.supplyType) {
      data.supplyType =
        form.supplyType === "" ? null : (form.supplyType as GstSupplyType);
    }
  }
  return data;
}
