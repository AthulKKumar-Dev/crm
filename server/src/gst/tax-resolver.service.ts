import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Resolves the effective GST rate for a product using the priority chain:
 *
 *   1. Product gstRate (highest priority — explicit per-product override)
 *   2. Collection tax override (if product belongs to a collection with an override)
 *   3. State base tax rate (default rate for the place of supply state)
 *   4. 0% (exempt — no rate configured anywhere)
 *
 * If a product belongs to multiple collections with overrides,
 * the HIGHEST rate is used (conservative — avoids under-charging tax).
 */
@Injectable()
export class TaxResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveGstRate(
    orgId: string,
    productId: string | null,
    productGstRate: number | null,
    placeOfSupplyCode: string,
  ): Promise<number> {
    // 1. Product-level override (highest priority)
    if (productGstRate !== null && productGstRate > 0) {
      return productGstRate;
    }

    // 2. Collection override
    if (productId) {
      const collectionOverride = await this.prisma.productCollection.findMany({
        where: { productId },
        include: {
          collection: {
            include: {
              taxOverride: {
                where: { organizationId: orgId },
              },
            },
          },
        },
      });

      const overrideRates = collectionOverride
        .map((pc) => pc.collection.taxOverride)
        .filter((override): override is NonNullable<typeof override> => override !== null)
        .map((override) => parseFloat(override.gstRate.toString()));

      if (overrideRates.length > 0) {
        // Use highest rate to avoid under-charging
        return Math.max(...overrideRates);
      }
    }

    // 3. State base tax rate
    const stateTaxRate = await this.prisma.stateTaxRate.findFirst({
      where: {
        organizationId: orgId,
        stateCode: placeOfSupplyCode,
      },
    });

    if (stateTaxRate) {
      return parseFloat(stateTaxRate.gstRate.toString());
    }

    // 4. No rate configured — exempt
    return 0;
  }
}
