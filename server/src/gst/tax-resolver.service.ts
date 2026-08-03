import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Resolves the effective GST rate for a product using the priority chain:
 *
 *   1. Product gstRate (highest priority — explicit per-product override)
 *   2. Collection tax override (if product belongs to a collection with an override)
 *   3. Product type tax rate (default rate for the product's type, e.g. "T-Shirts" = 12%)
 *   4. State base tax rate (default rate for the place of supply state)
 *   5. 0% (exempt — no rate configured anywhere)
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
    // 1. Product-level override (highest priority).
    //    `>= 0`, not `> 0`: a product explicitly configured at 0% is EXEMPT and
    //    must stop here. Treating 0 as "unset" made exempt goods fall through
    //    to the collection/product-type/state rates and get taxed. Callers must
    //    pass `toNullableNumber(product.gstRate)` so null (unset) and 0
    //    (exempt) stay distinguishable.
    if (productGstRate !== null && productGstRate >= 0) {
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
        return Math.max(...overrideRates);
      }
    }

    // 3. Product type tax rate
    if (productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { productType: true },
      });

      if (product?.productType) {
        const productTypeTaxRate = await this.prisma.productTypeTaxRate.findFirst({
          where: {
            organizationId: orgId,
            productType: product.productType,
          },
        });

        if (productTypeTaxRate) {
          return parseFloat(productTypeTaxRate.gstRate.toString());
        }
      }
    }

    // 4. State base tax rate
    const stateTaxRate = await this.prisma.stateTaxRate.findFirst({
      where: {
        organizationId: orgId,
        stateCode: placeOfSupplyCode,
      },
    });

    if (stateTaxRate) {
      return parseFloat(stateTaxRate.gstRate.toString());
    }

    // 5. No rate configured — exempt
    return 0;
  }
}
