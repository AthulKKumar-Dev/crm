import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

import { parseTaxSettings } from '../organization-settings/schemas/tax-settings.schema';
import {
  CREDIT_NOTE_PREFIX,
  buildDocumentNumber,
  resolveInvoicePrefix,
} from './invoice-number.util';

@Injectable()
export class InvoiceNumberService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate the next sequential invoice number for an organization.
   * Format: {series}-{shortFinancialYear}/{paddedSequential}
   * Example: INV-25-26/000001, or SJ-25-26/000001 for a merchant series.
   *
   * The series comes from `taxSettings.invoicePrefix` and defaults to `INV`.
   * Changing it starts a NEW consecutive run at 000001, because the sequence
   * is read back per prefix — which is legitimate under GST (multiple series
   * are allowed, each consecutive) but is a visible change the settings screen
   * warns about before saving.
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
    return this.next(orgId, financialYear, null, tx);
  }

  /**
   * Next credit-note number, on its OWN series: `CN-{FY}/{000001}`.
   *
   * Separate from the invoice series deliberately. A credit note is its own
   * statutory document with its own consecutive numbering, and mixing them
   * would put non-invoices inside a gapless invoice run — hard to defend in an
   * audit and impossible to reconcile against a filed GSTR-1.
   */
  async getNextCreditNoteNumber(
    orgId: string,
    financialYear: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    return this.next(orgId, financialYear, CREDIT_NOTE_PREFIX, tx);
  }

  /**
   * @param prefix fixed series (credit notes), or null to read the org's
   *   configured invoice series.
   */
  private async next(
    orgId: string,
    financialYear: string,
    prefix: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    if (tx) {
      return this.compute(tx, orgId, financialYear, prefix);
    }

    return this.prisma.$transaction(
      (innerTx) => this.compute(innerTx, orgId, financialYear, prefix),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000,
      },
    );
  }

  /**
   * The org's configured invoice series. Read on the caller's transaction
   * rather than through OrganizationSettingsService, matching how
   * InvoiceService reads the same blob: no new injection, and it cannot see a
   * value the surrounding transaction did not.
   */
  private async resolvePrefix(
    client: Prisma.TransactionClient,
    orgId: string,
  ): Promise<string> {
    const row = await client.organizationSettings.findUnique({
      where: { organizationId: orgId },
      select: { taxSettings: true },
    });
    return resolveInvoicePrefix(parseTaxSettings(row?.taxSettings ?? null).invoicePrefix);
  }

  private async compute(
    client: Prisma.TransactionClient,
    orgId: string,
    financialYear: string,
    fixedPrefix: string | null,
  ): Promise<string> {
    const prefix = fixedPrefix ?? (await this.resolvePrefix(client, orgId));
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
    // ⚠️ The PREFIX FILTER is what keeps the two series apart, and it is not
    // optional. Credit notes live in this same table, so without it a single
    // `MAX(sequence)` would span both — issuing CN-2026-27/000001 would make
    // the next INVOICE skip to 000002, permanently gapping a statutory serial
    // run that the whole numbering design exists to keep gapless.
    const rows = await client.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(split_part(invoice_number, '/', 2)::int) AS max
      FROM invoices
      WHERE organization_id = ${orgId}
        AND financial_year = ${financialYear}
        AND invoice_number LIKE ${`${prefix}-%`}
        AND split_part(invoice_number, '/', 2) ~ '^[0-9]+$'`;

    const nextSequence = (rows[0]?.max ?? 0) + 1;

    // The year is shortened to "26-27" so the whole number fits Rule 46(b)'s
    // sixteen characters — see invoice-number.util. The LIKE filter and the
    // `/`-delimited tail above are unchanged, so a series that started under
    // the older 18-character form continues without a gap.
    return buildDocumentNumber(prefix, financialYear, nextSequence);
  }
}
