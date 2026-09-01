import { IsOptional, IsString } from 'class-validator';
import { IsFinancialYear } from '../../common/validators/is-financial-year.validator';

export class QueryInvoiceStatsDto {
  // Scopes the chip counts to one financial year. The month-to-date figures are
  // always the current month, so they ignore this.
  //
  // Validated for the same reason as QueryGstReturnDto: this value reaches
  // `gstPeriodRange`, which throws a raw Error (→ 500) on anything it cannot
  // parse.
  @IsOptional()
  @IsFinancialYear()
  financialYear?: string;

  @IsOptional()
  @IsString()
  sellerGstinId?: string;
}
