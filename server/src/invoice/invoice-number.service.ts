import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvoiceNumberService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate the next sequential invoice number for an organization.
   * Format: INV-{financialYear}/{paddedSequential}
   * Example: INV-2025-26/000001
   *
   * Concurrency contract: this is read-max-then-increment, which races by
   * design. Safety comes from the caller, not from this helper —
   * @@unique([organizationId, invoiceNumber]) rejects the losing duplicate,
   * and every caller must run inside a Serializable transaction wrapped in
   * retryOnNumberingConflict (see InvoiceService.create and
   * OrderService.createOfflineOrder), which re-runs on P2002/P2034 and
   * re-reads the max. A rolled-back attempt consumes no number, so the
   * sequence stays gapless.
   *
   * Pass `tx` to participate in the caller's transaction (required for the
   * number to be atomic with the invoice insert). The tx-less branch exists
   * for future standalone callers and opens its own Serializable transaction.
   */
  async getNextInvoiceNumber(
    orgId: string,
    financialYear: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    if (tx) {
      return this.compute(tx, orgId, financialYear);
    }

    return this.prisma.$transaction(
      (innerTx) => this.compute(innerTx, orgId, financialYear),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000,
      },
    );
  }

  private async compute(
    client: Prisma.TransactionClient,
    orgId: string,
    financialYear: string,
  ): Promise<string> {
    // Numeric max of the sequence part. A string sort
    // (orderBy: invoiceNumber desc) would break once the padded width is
    // exceeded: "INV-FY/1000000" sorts BELOW "INV-FY/999999", which would make
    // the generator re-issue 1000000 forever. Comparing the parsed sequence is
    // correct at any magnitude.
    //
    // The `~ '^[0-9]+$'` filter is load-bearing, not defensive noise: `::int`
    // raises 22P02 on any value it cannot parse, and one legacy or
    // hand-inserted invoice_number that does not match INV-<fy>/<digits> would
    // otherwise make EVERY future invoice for that org+FY fail permanently.
    // Non-conforming rows are ignored for sequencing rather than fatal.
    const rows = await client.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(split_part(invoice_number, '/', 2)::int) AS max
      FROM invoices
      WHERE organization_id = ${orgId}
        AND financial_year = ${financialYear}
        AND split_part(invoice_number, '/', 2) ~ '^[0-9]+$'`;

    const nextSequence = (rows[0]?.max ?? 0) + 1;

    // padStart keeps the common case fixed-width for display; wider numbers
    // simply grow past 6 digits (the numeric max above doesn't care).
    const paddedSequence = nextSequence.toString().padStart(6, '0');
    return `INV-${financialYear}/${paddedSequence}`;
  }
}
