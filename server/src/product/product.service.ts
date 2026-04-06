import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryProductsDto } from './dto/query-products.dto';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) { }

  async findAll(orgId: string, query: QueryProductsDto) {
    const where: Prisma.ProductWhereInput = {
      organizationId: orgId,
      deletedAt: null,
    };

    if (query.status) where.status = query.status;
    if (query.vendor) where.vendor = query.vendor;
    if (query.productType) where.productType = query.productType;
    if (query.channelId) where.channelId = query.channelId;

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { vendor: { contains: query.search, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    // Stock status filter — filter products by their variants' inventory
    if (query.stockStatus === 'out_of_stock') {
      where.variants = { every: { inventoryQuantity: { lte: 0 } } };
    } else if (query.stockStatus === 'low_stock') {
      // Low stock = any variant has stock > 0 but <= org threshold (default 10)
      const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { lowStockThreshold: true } });
      const threshold = org?.lowStockThreshold ?? 10;
      where.variants = { some: { inventoryQuantity: { gt: 0, lte: threshold } } };
    } else if (query.stockStatus === 'in_stock') {
      where.variants = { some: { inventoryQuantity: { gt: 0 } } };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          variants: {
            select: { id: true, title: true, sku: true, price: true, inventoryQuantity: true, option1: true, option2: true, option3: true },
            orderBy: { position: 'asc' },
          },
          images: {
            select: { id: true, src: true, alt: true },
            orderBy: { position: 'asc' },
            take: 1,  // Only first image for list view
          },
          channel: { select: { id: true, name: true, platform: true } },
        },
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: data.map((product) => {
        // Calculate total stock across all variants
        const totalStock = product.variants.reduce((sum, v) => sum + v.inventoryQuantity, 0);
        const lowestVariantStock = product.variants.length > 0
          ? Math.min(...product.variants.map((v) => v.inventoryQuantity))
          : 0;

        return {
          id: product.id,
          title: product.title,
          vendor: product.vendor,
          productType: product.productType,
          status: product.status,
          tags: product.tags,
          totalStock,
          variantCount: product.variants.length,
          priceRange: this.getPriceRange(product.variants),
          image: product.images[0] || null,
          channel: product.channel,
          createdAt: product.externalCreatedAt || product.createdAt,
          variants: product.variants,
        };
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, orgId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        variants: { orderBy: { position: 'asc' } },
        images: { orderBy: { position: 'asc' } },
        channel: { select: { id: true, name: true, platform: true } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');

    const totalStock = product.variants.reduce((sum, v) => sum + v.inventoryQuantity, 0);

    return {
      ...product,
      totalStock,
      priceRange: this.getPriceRange(product.variants),
    };
  }

  // Get unique vendors for filter dropdown
  async getVendors(orgId: string) {
    const vendors = await this.prisma.product.findMany({
      where: { organizationId: orgId, deletedAt: null, vendor: { not: null } },
      select: { vendor: true },
      distinct: ['vendor'],
      orderBy: { vendor: 'asc' },
    });
    return vendors.map((v) => v.vendor).filter(Boolean);
  }

  // Get unique product types for filter dropdown
  async getProductTypes(orgId: string) {
    const types = await this.prisma.product.findMany({
      where: { organizationId: orgId, deletedAt: null, productType: { not: null } },
      select: { productType: true },
      distinct: ['productType'],
      orderBy: { productType: 'asc' },
    });
    return types.map((t) => t.productType).filter(Boolean);
  }

  async getStats(orgId: string, channelId?: string) {
    const baseWhere: Prisma.ProductWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      ...(channelId && { channelId }),
    };

    // Get the org's low stock threshold
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { lowStockThreshold: true },
    });
    const threshold = org?.lowStockThreshold ?? 10;

    const [
      totalProducts,
      activeListings,
      draftProducts,
      archivedProducts,
      outOfStockProducts,
      lowStockProducts,
      totalInventory,
    ] = await Promise.all([
      // Total products (all statuses)
      this.prisma.product.count({ where: baseWhere }),

      // Active listings
      this.prisma.product.count({ where: { ...baseWhere, status: 'ACTIVE' } }),

      // Draft products
      this.prisma.product.count({ where: { ...baseWhere, status: 'DRAFT' } }),

      // Archived products
      this.prisma.product.count({ where: { ...baseWhere, status: 'ARCHIVED' } }),

      // Out of stock — all variants have 0 or less inventory
      this.prisma.product.count({
        where: {
          ...baseWhere,
          status: 'ACTIVE',
          variants: { every: { inventoryQuantity: { lte: 0 } } },
        },
      }),

      // Low stock — at least one variant has stock > 0 but <= threshold
      this.prisma.product.count({
        where: {
          ...baseWhere,
          status: 'ACTIVE',
          variants: { some: { inventoryQuantity: { gt: 0, lte: threshold } } },
        },
      }),

      // Total inventory units across all variants
      this.prisma.productVariant.aggregate({
        where: { product: baseWhere },
        _sum: { inventoryQuantity: true },
      }),
    ]);

    return {
      totalProducts,
      activeListings,
      draftProducts,
      archivedProducts,
      outOfStockProducts,
      lowStockProducts,
      lowStockThreshold: threshold,
      totalInventoryUnits: totalInventory._sum.inventoryQuantity ?? 0,
    };
  }

  private getPriceRange(variants: Array<{ price: any }>) {
    if (variants.length === 0) return { min: '0', max: '0' };
    const prices = variants.map((v) => parseFloat(String(v.price)));
    return { min: Math.min(...prices).toFixed(2), max: Math.max(...prices).toFixed(2) };
  }
}