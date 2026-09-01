import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { GST_PERIOD_REGEX } from '../../common/utils/zoned-date.util';
import { IsFinancialYear } from '../../common/validators/is-financial-year.validator';
import { GstReturnType } from './query-gst-return.dto';

/**
 * Record that a period has been filed with the government.
 *
 * Locking is the point: until this existed, GSTR-1/3B were recomputed from
 * `invoices` on every request, so issuing or cancelling an invoice inside an
 * already-filed month silently rewrote history.
 */
export class MarkFiledDto {
  @IsFinancialYear()
  financialYear: string;

  @Matches(GST_PERIOD_REGEX, {
    message:
      'period must be a two-digit month ("04") or a financial-year quarter ("Q1").',
  })
  period: string;

  @IsEnum(GstReturnType)
  returnType: GstReturnType;

  /** Omit when the filing covers all registrations. */
  @IsOptional()
  @IsString()
  sellerGstinId?: string;

  /** Acknowledgement Reference Number from the portal, when known. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  arn?: string;
}
