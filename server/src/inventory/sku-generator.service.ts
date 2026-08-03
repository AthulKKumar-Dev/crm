import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationSettingsService } from '../organization-settings/organization-settings.service';
import { GenerateCodesDto } from './dto/generate-skus.dto';

/**
 * SKU / barcode generation.
 *
 * SKU shape: {PREFIX}-{PRODUCTCODE}-{SEQ}-{OPTIONS}, e.g. 9TH-SAR-001-BLK-FS.
 *   PREFIX      org-level (settings.skuPrefix, else derived from the slug)
 *   PRODUCTCODE first 3 alphanumerics of the product title (fallback PRD)
 *   SEQ         org-scoped sequence, zero-padded to 3, claimed atomically
 *   OPTIONS     up to 3 option values, 2-3 chars each, uppercased
 * Charset is uppercase alnum + dashes only — keyboard-wedge scanners emit
 * layout-dependent keystrokes and this set survives every layout.
 *
 * Barcode = the SKU itself, rendered as Code 128 client-side. We NEVER invent
 * EAN/UPC numbers: a fabricated check-digit-valid EAN collides with real
 * GS1-assigned retail products. Existing barcodes (synced from Shopify) are
 * left alone unless `overwrite` is explicitly set.
 *
 * Uniqueness: no DB unique on sku/barcode (Shopify legally syncs duplicates
 * in). Generated codes are unique by construction (sequence) plus a
 * skip-and-increment probe against the org-scoped index; the duplicates
 * report covers imported data.
 */
@Injectable()
export class SkuGeneratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: OrganizationSettingsService,
  ) {}

  async generateSkus(orgId: string, dto: GenerateCodesDto) {
    const variants = await this.loadTargets(orgId, dto, 'sku');
    if (variants.length === 0) return { generated: 0, skipped: 0, conflicts: [] };

    const prefix = await this.resolvePrefix(orgId);
    const startSeq = await this.claimSequence(orgId, variants.length);

    // Existing SKUs in the org — the collision probe set. One indexed query;
    // org SKU counts are bounded (≤ low tens of thousands) so an in-memory
    // set beats N probe queries.
    const existing = new Set(
      (
        await this.prisma.productVariant.findMany({
          where: { organizationId: orgId, sku: { not: null } },
          select: { sku: true },
        })
      ).map((v) => v.sku as string),
    );

    let seq = startSeq;
    let generated = 0;
    const conflicts: Array<{ variantId: string; reason: string }> = [];

    for (const v of variants) {
      const productCode = this.mnemonic(v.product.title);
      const optionPart = [v.option1, v.option2, v.option3]
        .filter((o): o is string => !!o && o !== 'Default Title')
        .map((o) => this.mnemonic(o, 2))
        .join('-');

      // Skip-and-increment: hand-typed SKUs may already occupy a code the
      // sequence reaches. The set probe is O(1); the sequence was claimed
      // beyond our batch size, so running over is fine — sequence gaps are
      // harmless.
      let candidate: string;
      do {
        candidate = [prefix, productCode, String(seq).padStart(3, '0'), optionPart]
          .filter(Boolean)
          .join('-');
        seq++;
      } while (existing.has(candidate));
      existing.add(candidate);

      await this.prisma.productVariant.update({
        where: { id: v.id },
        data: { sku: candidate },
      });
      generated++;
    }

    // Sequence may have run past the claim (collision skips) — re-claim the
    // overrun so the next batch starts clean.
    const overrun = seq - startSeq - variants.length;
    if (overrun > 0) await this.claimSequence(orgId, overrun);

    return { generated, skipped: variants.length - generated, conflicts };
  }

  async generateBarcodes(orgId: string, dto: GenerateCodesDto) {
    const variants = await this.loadTargets(orgId, dto, 'barcode');
    let generated = 0;
    const conflicts: Array<{ variantId: string; reason: string }> = [];

    for (const v of variants) {
      if (!v.sku) {
        conflicts.push({ variantId: v.id, reason: 'No SKU — generate SKUs first.' });
        continue;
      }
      await this.prisma.productVariant.update({
        where: { id: v.id },
        data: { barcode: v.sku },
      });
      generated++;
    }
    return { generated, skipped: conflicts.length, conflicts };
  }

  /** Duplicate SKU/barcode report — surfaces imported collisions for cleanup. */
  async findDuplicates(orgId: string) {
    const dupes = async (column: 'sku' | 'barcode') => {
      const rows = await this.prisma.$queryRaw<
        Array<{ code: string; count: bigint; variant_ids: string[] }>
      >(Prisma.sql`
        SELECT pv.${Prisma.raw(`"${column}"`)} AS code,
               COUNT(*) AS count,
               array_agg(pv."id") AS variant_ids
        FROM "product_variants" pv
        WHERE pv."organization_id" = ${orgId}
          AND pv.${Prisma.raw(`"${column}"`)} IS NOT NULL
          AND pv.${Prisma.raw(`"${column}"`)} <> ''
        GROUP BY pv.${Prisma.raw(`"${column}"`)}
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
        LIMIT 200
      `);
      return rows.map((r) => ({
        code: r.code,
        count: Number(r.count),
        variantIds: r.variant_ids,
      }));
    };
    const [skus, barcodes] = await Promise.all([dupes('sku'), dupes('barcode')]);
    return { duplicateSkus: skus, duplicateBarcodes: barcodes };
  }

  /** Validate a manual SKU/barcode edit (called by the products UI): 409 on collision. */
  async assertCodeFree(orgId: string, code: string, excludeVariantId?: string) {
    const clash = await this.prisma.productVariant.findFirst({
      where: {
        organizationId: orgId,
        OR: [{ sku: code }, { barcode: code }],
        ...(excludeVariantId ? { id: { not: excludeVariantId } } : {}),
      },
      select: { id: true, sku: true },
    });
    if (clash) {
      throw new ConflictException(`Code "${code}" is already used by another variant.`);
    }
  }

  // ─────────────────────────── internals ───────────────────────────

  private async loadTargets(
    orgId: string,
    dto: GenerateCodesDto,
    target: 'sku' | 'barcode',
  ) {
    const filter = dto.filter ?? (target === 'sku' ? 'missing-sku' : 'missing-barcode');
    const where: Prisma.ProductVariantWhereInput = {
      organizationId: orgId,
      product: { deletedAt: null },
    };
    if (dto.variantIds && dto.variantIds.length > 0) where.id = { in: dto.variantIds };
    if (!dto.overwrite) {
      if (filter === 'missing-sku') where.OR = [{ sku: null }, { sku: '' }];
      else if (filter === 'missing-barcode') where.OR = [{ barcode: null }, { barcode: '' }];
      else {
        // 'all' without overwrite still only fills gaps in the target column.
        where.OR =
          target === 'sku'
            ? [{ sku: null }, { sku: '' }]
            : [{ barcode: null }, { barcode: '' }];
      }
    }
    return this.prisma.productVariant.findMany({
      where,
      take: 2000,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        sku: true,
        barcode: true,
        option1: true,
        option2: true,
        option3: true,
        product: { select: { title: true } },
      },
    });
  }

  private async resolvePrefix(orgId: string): Promise<string> {
    const settings = await this.settings.getInventorySettings(orgId);
    if (settings.skuPrefix) return settings.skuPrefix.toUpperCase();
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { slug: true, name: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return this.mnemonic(org.slug || org.name);
  }

  /** First `len` alphanumerics, uppercased. "9thara sarees" → "9TH". */
  private mnemonic(text: string, len = 3): string {
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return cleaned.slice(0, len) || 'PRD';
  }

  /**
   * Atomically claim `count` sequence numbers; returns the first claimed
   * value. Raw JSONB arithmetic — two concurrent claims serialize on the row
   * lock, so ranges never overlap.
   */
  private async claimSequence(orgId: string, count: number): Promise<number> {
    // The settings row is created lazily elsewhere — make sure it exists.
    await this.prisma.$executeRaw`
      INSERT INTO "organization_settings" ("id", "organization_id", "created_at", "updated_at")
      VALUES (${`invseq_${orgId}`}, ${orgId}, NOW(), NOW())
      ON CONFLICT ("organization_id") DO NOTHING
    `;
    const rows = await this.prisma.$queryRaw<Array<{ next_seq: number }>>`
      UPDATE "organization_settings"
      SET "inventory_settings" = jsonb_set(
        COALESCE("inventory_settings", '{}'::jsonb),
        '{skuSequence}',
        to_jsonb(COALESCE(("inventory_settings"->>'skuSequence')::int, 1) + ${count})
      ),
      "updated_at" = NOW()
      WHERE "organization_id" = ${orgId}
      RETURNING ("inventory_settings"->>'skuSequence')::int - ${count} AS next_seq
    `;
    return rows[0]?.next_seq ?? 1;
  }
}
