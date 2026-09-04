import { IsOptional, IsString, IsEnum, Matches } from 'class-validator';
import { GST_PERIOD_REGEX } from '../../common/utils/zoned-date.util';
import { IsFinancialYear } from '../../common/validators/is-financial-year.validator';

export enum GstReturnType {
  GSTR1 = 'GSTR1',
  GSTR3B = 'GSTR3B',
}

export class QueryGstReturnDto {
  // Validated rather than left a bare @IsString(): `gstPeriodRange` throws a
  // raw Error for a value it cannot parse, which NestJS turns into a 500. Both
  // fields are also interpolated into the export's Content-Disposition
  // filename, so constraining them here narrows that surface too.
  @IsFinancialYear()
  financialYear: string; // e.g. "2025-26"

  @Matches(GST_PERIOD_REGEX, {
    message:
      'period must be a two-digit month ("04") or a financial-year quarter ("Q1").',
  })
  period: string; // e.g. "04" for April, "Q1" for quarter

  @IsOptional()
  @IsEnum(GstReturnType)
  returnType?: GstReturnType = GstReturnType.GSTR1;

  @IsOptional()
  @IsString()
  sellerGstinId?: string; // Filter by specific GSTIN for multi-state

  /**
   * REFERENCE VIEW ONLY. Narrows the return to invoices dispatched from one
   * warehouse, so a merchant can see what a branch contributed.
   *
   * A GST return is filed PER GSTIN and has no warehouse dimension — there is
   * no such field on the portal. A scoped view is management information, never
   * a filing, which is why `markFiled` does not accept this parameter.
   */
  @IsOptional()
  @IsString()
  dispatchWarehouseId?: string;
}
