import { IsOptional, IsString } from 'class-validator';

export class QueryInvoiceStatsDto {
  // Scopes the chip counts to one financial year. The month-to-date figures are
  // always the current month, so they ignore this.
  @IsOptional()
  @IsString()
  financialYear?: string;

  @IsOptional()
  @IsString()
  sellerGstinId?: string;
}
