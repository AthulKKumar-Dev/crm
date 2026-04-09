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
import { extractStateCodeFromGstin } from './constants/gst-rates';

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
  async create(orgId: string, dto: CreateGstinDto) {
    // Validate state code from GSTIN matches provided stateCode
    const gstinStateCode = extractStateCodeFromGstin(dto.gstin);
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

    // If this is the first GSTIN or isDefault is true, handle default logic
    const existingCount = await this.prisma.organizationGstin.count({
      where: { organizationId: orgId },
    });

    const shouldBeDefault = dto.isDefault || existingCount === 0;

    // If setting as default, unset other defaults
    if (shouldBeDefault) {
      await this.prisma.organizationGstin.updateMany({
        where: { organizationId: orgId, isDefault: true },
        data: { isDefault: false },
      });
    }

    try {
      return await this.prisma.organizationGstin.create({
        data: {
          organizationId: orgId,
          gstin: dto.gstin,
          legalName: dto.legalName,
          tradeName: dto.tradeName,
          stateCode: dto.stateCode,
          stateName: resolvedStateName,
          address: dto.address,
          isDefault: shouldBeDefault,
        },
      });
    } catch (error: any) {
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

    // If updating GSTIN string, validate state code consistency
    if (dto.gstin) {
      const gstinStateCode = extractStateCodeFromGstin(dto.gstin);
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

    // Handle default toggle
    if (dto.isDefault === true) {
      await this.prisma.organizationGstin.updateMany({
        where: { organizationId: orgId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const stateName = dto.stateCode
      ? getStateName(dto.stateCode) || dto.stateName
      : dto.stateName;

    return this.prisma.organizationGstin.update({
      where: { id },
      data: {
        ...(dto.gstin && { gstin: dto.gstin }),
        ...(dto.legalName && { legalName: dto.legalName }),
        ...(dto.tradeName !== undefined && { tradeName: dto.tradeName }),
        ...(dto.stateCode && { stateCode: dto.stateCode }),
        ...(stateName && { stateName }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  // ─── DELETE (DEACTIVATE) GSTIN ───
  // Soft-delete by marking as inactive rather than removing.
  // WHY? Existing invoices reference this GSTIN — can't hard delete.
  async deactivate(id: string, orgId: string) {
    await this.findOne(id, orgId);

    await this.prisma.organizationGstin.update({
      where: { id },
      data: { isActive: false },
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
