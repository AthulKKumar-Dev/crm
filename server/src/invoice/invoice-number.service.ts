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
   * Uses a Serializable transaction to prevent race conditions.
   * The @@unique([organizationId, invoiceNumber]) constraint on Invoice
   * provides an additional safety net.
   */
  async getNextInvoiceNumber(
    orgId: string,
    financialYear: string,
  ): Promise<string> {
    return this.prisma.$transaction(
      async (tx) => {
        // Find the last invoice for this org + financial year
        const lastInvoice = await tx.invoice.findFirst({
          where: {
            organizationId: orgId,
            financialYear,
          },
          orderBy: { invoiceNumber: 'desc' },
          select: { invoiceNumber: true },
        });

        let nextSequence = 1;

        if (lastInvoice) {
          // Parse the sequential number from "INV-2025-26/000042"
          const parts = lastInvoice.invoiceNumber.split('/');
          const lastSequence = parseInt(parts[parts.length - 1], 10);
          nextSequence = lastSequence + 1;
        }

        // Zero-pad to 6 digits
        const paddedSequence = nextSequence.toString().padStart(6, '0');

        return `INV-${financialYear}/${paddedSequence}`;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000,
      },
    );
  }
}
