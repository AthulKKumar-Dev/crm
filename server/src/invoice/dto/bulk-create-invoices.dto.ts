import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

/**
 * Upper bound on one bulk request. Invoices are issued one after another (see
 * `InvoiceService.bulkCreate`), so this bounds how long the request runs — it
 * has to finish inside the client's bulk timeout and a default 60s proxy read
 * timeout. The Orders list selects one page (9 rows) at a time.
 */
export const MAX_BULK_INVOICES = 25;

export class BulkCreateInvoicesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_INVOICES)
  @IsString({ each: true })
  orderIds: string[];
}
