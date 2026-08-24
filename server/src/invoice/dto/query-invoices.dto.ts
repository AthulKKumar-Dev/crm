import { IsOptional, IsString, IsInt, Max, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceStatus } from '@prisma/client';

/** Registered (has a GSTIN) vs. unregistered buyers. */
export enum InvoiceBuyerType {
  B2B = 'B2B',
  B2C = 'B2C',
}

/**
 * Modelled as an enum rather than a `?unpaid=true` boolean: booleans arriving
 * as query strings need a `@Transform`, and "true"/"1"/"" all had to be handled
 * before `@IsBoolean` would pass. An enum validates as-is.
 */
export enum InvoicePaymentState {
  UNPAID = 'UNPAID',
}

export class QueryInvoicesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  // Capped like the sibling query DTOs (orders, customers). Without a ceiling
  // `?limit=1000000` was passed straight into `take`.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  financialYear?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  sellerGstinId?: string;

  /** Registered vs. unregistered buyers — the B2B filter chip. */
  @IsOptional()
  @IsEnum(InvoiceBuyerType)
  buyerType?: InvoiceBuyerType;

  /**
   * Narrows to issued invoices whose order still owes money. The invoice itself
   * stores no payment state, so this filters on the related order's
   * `financialStatus`.
   */
  @IsOptional()
  @IsEnum(InvoicePaymentState)
  paymentState?: InvoicePaymentState;
}
