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

/**
 * Columns the list may be ordered by.
 *
 * An ENUM, not the `sortBy?: string` used by query-orders / query-customers /
 * query-products. Those spread an unvalidated caller-supplied key straight into
 * `orderBy: { [sortBy]: sortOrder }`, which lets a request order by any scalar
 * on the model (and 500s on anything else). Whitelisting keeps the surface to
 * the columns the table actually renders.
 */
export enum InvoiceSortField {
  invoiceDate = 'invoiceDate',
  invoiceNumber = 'invoiceNumber',
  buyerName = 'buyerName',
  subtotal = 'subtotal',
  totalTax = 'totalTax',
  grandTotal = 'grandTotal',
}

export enum InvoiceSortOrder {
  asc = 'asc',
  desc = 'desc',
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

  @IsOptional()
  @IsEnum(InvoiceSortField)
  sortBy?: InvoiceSortField = InvoiceSortField.invoiceDate;

  @IsOptional()
  @IsEnum(InvoiceSortOrder)
  sortOrder?: InvoiceSortOrder = InvoiceSortOrder.desc;
}
