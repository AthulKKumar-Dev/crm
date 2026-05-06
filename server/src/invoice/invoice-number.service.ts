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
   * Pass `tx` to participate in an outer transaction (e.g. the offline-order
   * flow that creates Order + Invoice atomically). When omitted, the helper
   * opens its own Serializable transaction and the @@unique constraint on
   * Invoice provides the safety net.
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
    const lastInvoice = await client.invoice.findFirst({
      where: { organizationId: orgId, financialYear },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });

    let nextSequence = 1;
    if (lastInvoice) {
      const parts = lastInvoice.invoiceNumber.split('/');
      const lastSequence = parseInt(parts[parts.length - 1], 10);
      nextSequence = lastSequence + 1;
    }

    const paddedSequence = nextSequence.toString().padStart(6, '0');
    return `INV-${financialYear}/${paddedSequence}`;
  }
}
