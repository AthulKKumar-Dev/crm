import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { GST_PERIOD_REGEX } from '../../common/utils/zoned-date.util';
import { IsFinancialYear } from '../../common/validators/is-financial-year.validator';
import { GSTIN_REGEX } from '../../gst/constants/gst-rates';

/**
 * One supplier's charge for one period.
 *
 * Upsert rather than create: the unique key is (org, year, period, supplier), so
 * re-entering a month's Razorpay figure corrects it instead of raising a
 * duplicate that would double the claim.
 */
export class UpsertInwardSupplyDto {
  @IsFinancialYear()
  financialYear: string; // "2026-27"

  @Matches(GST_PERIOD_REGEX, {
    message:
      'period must be a two-digit month ("04") or a financial-year quarter ("Q1").',
  })
  period: string;

  /**
   * Free text — the set of gateways is open. Trimmed and length-capped so it
   * cannot become an essay, and so the unique key stays meaningful.
   */
  @IsString()
  @MaxLength(60)
  supplier: string;

  /** The fee, excluding tax. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  feeAmount: number;

  /**
   * Omit when the invoice does not state it.
   *
   * ⚠️ Omitted is NOT the same as zero, and the service must not conflate them:
   * a foreign invoice with no GST line leaves the claim unknown, whereas 0
   * asserts there is genuinely no tax to claim. Sending 0 to mean "don't know"
   * would silently understate the credit while the total looked complete.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  gstAmount?: number;

  /**
   * The supplier's own GSTIN, from their invoice. Its presence is what separates
   * an ordinary domestic credit from an import of services.
   */
  @IsOptional()
  @Matches(GSTIN_REGEX, { message: 'supplierGstin must be a valid 15-character GSTIN.' })
  supplierGstin?: string;

  /**
   * Set when the fee is an import of services — the merchant pays the GST
   * itself under reverse charge and reclaims the same amount. Both legs are
   * declarable, and the first is the one people miss.
   */
  @IsOptional()
  @IsBoolean()
  isReverseCharge?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
