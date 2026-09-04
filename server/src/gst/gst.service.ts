import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGstinDto } from './dto/create-gstin.dto';
import { UpdateGstinDto } from './dto/update-gstin.dto';
import { CreateStateTaxRateDto } from './dto/create-state-tax-rate.dto';
import { UpdateStateTaxRateDto } from './dto/update-state-tax-rate.dto';
import { CreateCollectionOverrideDto } from './dto/create-collection-override.dto';
import { UpdateCollectionOverrideDto } from './dto/update-collection-override.dto';
import { CreateProductTypeTaxRateDto } from './dto/create-product-type-tax-rate.dto';
import { UpdateProductTypeTaxRateDto } from './dto/update-product-type-tax-rate.dto';
import {
  isValidStateCode,
  getStateName,
} from './constants/indian-states';
import { extractStateCodeFromGstin, normalizeGstin } from './constants/gst-rates';

@Injectable()
export class GstService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── LIST GSTINs ───
  // Returns all GSTIN registrations for an organization
  async findAll(orgId: string) {
    return this.prisma.organizationGstin.findMany({
      where: { organizationId: orgId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  // ─── GET SINGLE GSTIN ───
  async findOne(id: string, orgId: string) {
    const gstin = await this.prisma.organizationGstin.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!gstin) {
      throw new NotFoundException('GSTIN registration not found');
    }

    return gstin;
  }

  // ─── CREATE GSTIN ───
  // Adds a new GSTIN registration for the organization.
  // Validates state code matches the first 2 digits of GSTIN.
  //
  // Re-adding a GSTIN that was previously removed REVIVES the original row
  // rather than inserting a second one. Removal here is a soft delete
  // (`isActive: false`) because invoices and filed returns hold a foreign key
  // to the row, but the unique index on (organization_id, gstin) covers
  // inactive rows too — so an insert always hit P2002 and the merchant was
  // told the GSTIN "is already registered" while the list showed nothing,
  // with no way out. Reviving also keeps the id stable, so invoices issued
  // under that registration still point at the live row instead of being
  // orphaned by a fresh one.
  async create(orgId: string, dto: CreateGstinDto) {
    // Stored uppercase and trimmed, so the same number typed in a different
    // case is recognised as the same registration rather than slipping past
    // the unique index as a near-duplicate. The DTO's regex should already
    // guarantee this parses; the guard keeps the type honest.
    const gstin = normalizeGstin(dto.gstin);
    if (!gstin) {
      throw new BadRequestException(`Invalid GSTIN: ${dto.gstin}`);
    }
    // Validate state code from GSTIN matches provided stateCode
    const gstinStateCode = extractStateCodeFromGstin(gstin);
    if (gstinStateCode !== dto.stateCode) {
      throw new BadRequestException(
        `GSTIN state code (${gstinStateCode}) does not match provided state code (${dto.stateCode})`,
      );
    }

    // Validate state code exists
    if (!isValidStateCode(dto.stateCode)) {
      throw new BadRequestException(
        `Invalid state code: ${dto.stateCode}`,
      );
    }

    // Auto-fill state name if not exactly matching
    const resolvedStateName =
      getStateName(dto.stateCode) || dto.stateName;

    // Does this number already exist for the org, active or not? The unique
    // index does not distinguish, so this has to be checked before writing.
    const existing = await this.prisma.organizationGstin.findFirst({
      where: { organizationId: orgId, gstin },
    });
    if (existing?.isActive) {
      throw new ConflictException(
        'This GSTIN is already registered for your organization',
      );
    }

    // Only ACTIVE registrations count towards "is this the first one". A
    // deactivated row used to keep the count above zero, so the first GSTIN
    // added after clearing them all never became the default — leaving the
    // org with none, which silently breaks invoice seller selection.
    const activeCount = await this.prisma.organizationGstin.count({
      where: { organizationId: orgId, isActive: true },
    });
    const shouldBeDefault = dto.isDefault || activeCount === 0;

    const data = {
      legalName: dto.legalName,
      tradeName: dto.tradeName,
      stateCode: dto.stateCode,
      stateName: resolvedStateName,
      address: dto.address,
      isDefault: shouldBeDefault,
    };

    // One transaction. Unsetting the previous default used to run first and
    // separately, so when the insert then failed on P2002 the org was left
    // with NO default at all — a failed add quietly broke invoicing.
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (shouldBeDefault) {
          await tx.organizationGstin.updateMany({
            where: { organizationId: orgId, isDefault: true },
            data: { isDefault: false },
          });
        }
        if (existing) {
          return tx.organizationGstin.update({
            where: { id: existing.id },
            data: { ...data, isActive: true },
          });
        }
        return tx.organizationGstin.create({
          data: { organizationId: orgId, gstin, ...data },
        });
      });
    } catch (error: any) {
      // Still possible under a concurrent add of the same number.
      if (error.code === 'P2002') {
        throw new ConflictException(
          'This GSTIN is already registered for your organization',
        );
      }
      throw error;
    }
  }

  // ─── UPDATE GSTIN ───
  async update(id: string, orgId: string, dto: UpdateGstinDto) {
    const existing = await this.findOne(id, orgId);
    let gstin: string | undefined;
    if (dto.gstin !== undefined) {
      const normalized = normalizeGstin(dto.gstin);
      if (!normalized) {
        throw new BadRequestException(`Invalid GSTIN: ${dto.gstin}`);
      }
      gstin = normalized;
    }

    // If updating GSTIN string, validate state code consistency
    if (gstin) {
      const gstinStateCode = extractStateCodeFromGstin(gstin);
      const targetStateCode = dto.stateCode || existing.stateCode;
      if (gstinStateCode !== targetStateCode) {
        throw new BadRequestException(
          `GSTIN state code (${gstinStateCode}) does not match state code (${targetStateCode})`,
        );
      }
    }

    if (dto.stateCode && !isValidStateCode(dto.stateCode)) {
      throw new BadRequestException(
        `Invalid state code: ${dto.stateCode}`,
      );
    }

    const stateName = dto.stateCode
      ? getStateName(dto.stateCode) || dto.stateName
      : dto.stateName;

    // Both writes in one transaction: unsetting the old default and setting
    // the new one must not be separable, or a failure mid-way leaves the org
    // with no default.
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault === true) {
          await tx.organizationGstin.updateMany({
            where: { organizationId: orgId, isDefault: true, id: { not: id } },
            data: { isDefault: false },
          });
        }
        return tx.organizationGstin.update({
          where: { id },
          data: {
            ...(gstin && { gstin }),
            ...(dto.legalName && { legalName: dto.legalName }),
            ...(dto.tradeName !== undefined && { tradeName: dto.tradeName }),
            ...(dto.stateCode && { stateCode: dto.stateCode }),
            ...(stateName && { stateName }),
            ...(dto.address !== undefined && { address: dto.address }),
            ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
            ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          },
        });
      });
    } catch (error: any) {
      // Editing one registration onto a number the org already holds — even a
      // deactivated one — used to surface as a raw 500.
      if (error.code === 'P2002') {
        throw new ConflictException(
          'This GSTIN is already registered for your organization',
        );
      }
      throw error;
    }
  }

  // ─── DELETE (DEACTIVATE) GSTIN ───
  // Soft-delete by marking as inactive rather than removing.
  // WHY? Existing invoices reference this GSTIN — can't hard delete.
  async deactivate(id: string, orgId: string) {
    const existing = await this.findOne(id, orgId);

    await this.prisma.$transaction(async (tx) => {
      // Clearing `isDefault` matters: a deactivated row used to keep the flag,
      // so `findDefault` (which requires isActive) returned nothing while the
      // "unset other defaults" writes still targeted the dead row.
      await tx.organizationGstin.update({
        where: { id },
        data: { isActive: false, isDefault: false },
      });

      // Detach any warehouses declared as additional places of business under
      // this registration. They are only linkable while the registration is
      // active, and the invoice's dispatch guard refuses a warehouse whose
      // GSTIN differs from the invoice's seller — so a merchant who retires
      // GSTIN A and registers B in the same state would otherwise be blocked
      // on every explicit dispatch until each warehouse was re-linked by hand.
      await tx.warehouse.updateMany({
        where: { organizationId: orgId, gstinId: id },
        data: { gstinId: null, apobDeclared: false },
      });

      // Removing the default would otherwise leave the org with none, and
      // invoice seller selection falls back to nothing. Promote the oldest
      // surviving registration so there is always exactly one default while
      // any active registration exists.
      if (existing.isDefault) {
        const next = await tx.organizationGstin.findFirst({
          where: { organizationId: orgId, isActive: true, id: { not: id } },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (next) {
          await tx.organizationGstin.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return { message: 'GSTIN registration deactivated' };
  }

  // ─── FIND BY STATE ───
  // Used by invoice generation to auto-select seller GSTIN
  async findByState(orgId: string, stateCode: string) {
    return this.prisma.organizationGstin.findFirst({
      where: {
        organizationId: orgId,
        stateCode,
        isActive: true,
      },
    });
  }

  // ─── FIND DEFAULT ───
  // Returns the default GSTIN for the organization
  async findDefault(orgId: string) {
    return this.prisma.organizationGstin.findFirst({
      where: {
        organizationId: orgId,
        isDefault: true,
        isActive: true,
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE TAX RATES
  // ═══════════════════════════════════════════════════════════════════════════

  async findAllStateTaxRates(orgId: string) {
    return this.prisma.stateTaxRate.findMany({
      where: { organizationId: orgId },
      orderBy: { stateName: 'asc' },
    });
  }

  async createStateTaxRate(orgId: string, dto: CreateStateTaxRateDto) {
    if (!isValidStateCode(dto.stateCode)) {
      throw new BadRequestException(`Invalid state code: ${dto.stateCode}`);
    }

    const stateName = getStateName(dto.stateCode) || dto.stateCode;

    try {
      return await this.prisma.stateTaxRate.create({
        data: {
          organizationId: orgId,
          stateCode: dto.stateCode,
          stateName,
          gstRate: dto.gstRate,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('A tax rate for this state already exists');
      }
      throw error;
    }
  }

  async updateStateTaxRate(id: string, orgId: string, dto: UpdateStateTaxRateDto) {
    const existing = await this.prisma.stateTaxRate.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('State tax rate not found');

    return this.prisma.stateTaxRate.update({
      where: { id },
      data: { gstRate: dto.gstRate },
    });
  }

  async deleteStateTaxRate(id: string, orgId: string) {
    const existing = await this.prisma.stateTaxRate.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('State tax rate not found');

    await this.prisma.stateTaxRate.delete({ where: { id } });
    return { message: 'State tax rate removed' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COLLECTIONS & COLLECTION TAX OVERRIDES
  // ═══════════════════════════════════════════════════════════════════════════

  async findAllCollections(orgId: string) {
    return this.prisma.collection.findMany({
      where: { organizationId: orgId },
      orderBy: { title: 'asc' },
      include: { taxOverride: true },
    });
  }

  async findAllCollectionOverrides(orgId: string) {
    return this.prisma.collectionTaxOverride.findMany({
      where: { organizationId: orgId },
      include: { collection: { select: { id: true, title: true, handle: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCollectionOverride(orgId: string, dto: CreateCollectionOverrideDto) {
    // Verify collection belongs to this org
    const collection = await this.prisma.collection.findFirst({
      where: { id: dto.collectionId, organizationId: orgId },
    });
    if (!collection) throw new NotFoundException('Collection not found');

    try {
      return await this.prisma.collectionTaxOverride.create({
        data: {
          organizationId: orgId,
          collectionId: dto.collectionId,
          gstRate: dto.gstRate,
        },
        include: { collection: { select: { id: true, title: true, handle: true } } },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('This collection already has a tax override');
      }
      throw error;
    }
  }

  async updateCollectionOverride(id: string, orgId: string, dto: UpdateCollectionOverrideDto) {
    const existing = await this.prisma.collectionTaxOverride.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Collection tax override not found');

    return this.prisma.collectionTaxOverride.update({
      where: { id },
      data: { gstRate: dto.gstRate },
      include: { collection: { select: { id: true, title: true, handle: true } } },
    });
  }

  async deleteCollectionOverride(id: string, orgId: string) {
    const existing = await this.prisma.collectionTaxOverride.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Collection tax override not found');

    await this.prisma.collectionTaxOverride.delete({ where: { id } });
    return { message: 'Collection tax override removed' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCT TYPE TAX RATES
  // ═══════════════════════════════════════════════════════════════════════════

  async findAllProductTypeTaxRates(orgId: string) {
    return this.prisma.productTypeTaxRate.findMany({
      where: { organizationId: orgId },
      orderBy: { productType: 'asc' },
    });
  }

  async createProductTypeTaxRate(orgId: string, dto: CreateProductTypeTaxRateDto) {
    try {
      return await this.prisma.productTypeTaxRate.create({
        data: {
          organizationId: orgId,
          productType: dto.productType,
          gstRate: dto.gstRate,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('A tax rate for this product type already exists');
      }
      throw error;
    }
  }

  async updateProductTypeTaxRate(id: string, orgId: string, dto: UpdateProductTypeTaxRateDto) {
    const existing = await this.prisma.productTypeTaxRate.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Product type tax rate not found');

    return this.prisma.productTypeTaxRate.update({
      where: { id },
      data: { gstRate: dto.gstRate },
    });
  }

  async deleteProductTypeTaxRate(id: string, orgId: string) {
    const existing = await this.prisma.productTypeTaxRate.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Product type tax rate not found');

    await this.prisma.productTypeTaxRate.delete({ where: { id } });
    return { message: 'Product type tax rate removed' };
  }
}
