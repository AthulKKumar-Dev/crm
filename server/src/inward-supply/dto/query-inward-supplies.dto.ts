import { Matches } from 'class-validator';
import { GST_PERIOD_REGEX } from '../../common/utils/zoned-date.util';
import { IsFinancialYear } from '../../common/validators/is-financial-year.validator';

/** Both required — fees are only ever read for a specific filing period. */
export class QueryInwardSuppliesDto {
  @IsFinancialYear()
  financialYear: string;

  @Matches(GST_PERIOD_REGEX, {
    message:
      'period must be a two-digit month ("04") or a financial-year quarter ("Q1").',
  })
  period: string;
}
