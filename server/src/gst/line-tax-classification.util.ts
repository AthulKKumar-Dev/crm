import { GstSupplyType } from '@prisma/client';
import { normalizeUqc } from './constants/uqc';

/**
 * Statutory classification of one sale line: HSN, unit of quantity, supply
 * type. The GST RATE is deliberately not here — it has its own priority chain
 * in TaxResolverService, where the variant override is rung 0.
 *
 * Resolution is variant → product → fallback, field by field. A variant that
 * overrides only its HSN still inherits the product's supply type, and so on.
 * "Blank" on the variant means NULL (or empty / whitespace for the strings);
 * the columns carry no defaults for exactly this reason — a defaulted
 * 'TAXABLE' on the variant would silently override a product classified
 * EXEMPT.
 *
 * The export short-circuit stays outermost: ZERO_RATED is derived from where
 * the goods are going, not from what they are, so no override can undo it.
 *
 * Pure so it can be pinned by a spec without Prisma; every reader that has
 * the variant row (invoice generation today) goes through it.
 */
export interface LineTaxClassificationInput {
  /** ProductVariant override columns; absent / null = inherit. */
  variant?: {
    hsnCode?: string | null;
    unitOfMeasure?: string | null;
    supplyType?: GstSupplyType | null;
  } | null;
  /** Product-level classification (the default for every variant). */
  product?: {
    hsnCode?: string | null;
    unitOfMeasure?: string | null;
    supplyType?: GstSupplyType | null;
  } | null;
  /** Org tax settings `defaultUnitOfMeasure` — the final fallback (NOS). */
  defaultUnitOfMeasure: string;
  /** Place of supply is outside India → ZERO_RATED regardless of the goods. */
  isExportSupply: boolean;
}

export interface LineTaxClassification {
  /** Null when neither side classifies the goods — never the invented '0000'. */
  hsnCode: string | null;
  unitOfMeasure: string;
  supplyType: GstSupplyType;
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const t = typeof value === 'string' ? value.trim() : '';
  return t.length > 0 ? t : null;
}

export function resolveLineTaxClassification(
  input: LineTaxClassificationInput,
): LineTaxClassification {
  const v = input.variant ?? {};
  const p = input.product ?? {};

  const hsnCode = trimmedOrNull(v.hsnCode) ?? trimmedOrNull(p.hsnCode);

  const unitOfMeasure =
    normalizeUqc(v.unitOfMeasure) ??
    normalizeUqc(p.unitOfMeasure) ??
    input.defaultUnitOfMeasure;

  const supplyType = input.isExportSupply
    ? GstSupplyType.ZERO_RATED
    : (v.supplyType ?? p.supplyType ?? GstSupplyType.TAXABLE);

  return { hsnCode, unitOfMeasure, supplyType };
}
