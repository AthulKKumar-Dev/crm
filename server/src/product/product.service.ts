import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ChannelPlatform,
  ChannelStatus,
  Prisma,
  ProductStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { QueryProductsDto } from './dto/query-products.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ShopifyPushEnqueuer } from '../channel/shopify-push.enqueuer';
import { OrganizationSettingsService } from '../organization-settings/organization-settings.service';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyPushEnqueuer: ShopifyPushEnqueuer,
    private readonly settings: OrganizationSettingsService,
  ) {}

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
          shopifySync: this.extractShopifySync(product.metadata),
        };
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Pull the shopifySync sub-object out of Product.metadata for the list
   * response so the UI can render Syncing / Synced / Failed badges without
   * loading the full product detail.
   */
  private extractShopifySync(metadata: Prisma.JsonValue | null) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }
    const sync = (metadata as Record<string, unknown>).shopifySync;
    if (!sync || typeof sync !== 'object') return null;
    return sync as {
      status: 'PENDING' | 'SYNCED' | 'FAILED';
      shopifyProductId?: string;
      error?: string;
      syncedAt?: string;
      attempts: number;
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

  // ─── UPDATE GST FIELDS ───
  // Updates HSN code and GST rate for a product.
  // These are CRM-managed fields, not synced from Shopify.
  async updateGst(id: string, orgId: string, dto: { hsnCode?: string; gstRate?: number }) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.hsnCode !== undefined && { hsnCode: dto.hsnCode }),
        ...(dto.gstRate !== undefined && { gstRate: dto.gstRate }),
      },
      include: {
        variants: true,
        images: { orderBy: { position: 'asc' }, take: 1 },
      },
    });
  }

  private getPriceRange(variants: Array<{ price: any }>) {
    if (variants.length === 0) return { min: '0', max: '0' };
    const prices = variants.map((v) => parseFloat(String(v.price)));
    return { min: Math.min(...prices).toFixed(2), max: Math.max(...prices).toFixed(2) };
  }

  // ─── CREATE PRODUCT (CRM-NATIVE) ───
  // Creates a product on the org's MANUAL channel (lazy-creating it on first
  // call). After commit, if a SHOPIFY channel is connected, enqueues a single-
  // product push so the new product flows up to Shopify in the background.
  // Returns `shopifyPushQueued` so the UI can show the right status / toast.
  async create(orgId: string, _userId: string, dto: CreateProductDto) {
    const product = await this.prisma.$transaction(async (tx) => {
      // 1. Lazy-create the MANUAL channel.
      const channel = await tx.channel.upsert({
        where: {
          organizationId_platform: {
            organizationId: orgId,
            platform: ChannelPlatform.MANUAL,
          },
        },
        create: {
          organizationId: orgId,
          platform: ChannelPlatform.MANUAL,
          name: 'In-Store / Manual',
          status: ChannelStatus.CONNECTED,
          isEnabled: true,
        },
        update: {},
      });

      // 2. Create the product.
      const created = await tx.product.create({
        data: {
          organizationId: orgId,
          channelId: channel.id,
          externalId: `manual_${randomUUID()}`,
          title: dto.title,
          vendor: dto.vendor ?? null,
          productType: dto.productType ?? null,
          status: dto.status ?? ProductStatus.ACTIVE,
          tags: dto.tags ?? [],
          bodyHtml: dto.bodyHtml ?? null,
          hsnCode: dto.hsnCode ?? null,
          gstRate: dto.gstRate ?? null,
          metadata: { source: 'crm' } as Prisma.InputJsonObject,
          externalCreatedAt: new Date(),
          variants: {
            create: {
              externalId: `manual_${randomUUID()}`,
              title: 'Default Title',
              sku: dto.variant.sku ?? null,
              price: dto.variant.price,
              compareAtPrice: dto.variant.compareAtPrice ?? null,
              inventoryQuantity: dto.variant.inventoryQuantity ?? 0,
              option1: 'Default Title',
              position: 1,
              requiresShipping: true,
              taxable: true,
            },
          },
        },
        include: {
          variants: true,
          images: true,
          channel: { select: { id: true, name: true, platform: true } },
        },
      });

      return created;
    });

    // 3. Auto-push to Shopify — only if the org has opted in via
    //    productSettings.autoSyncToShopify. Default is OFF: products stay
    //    local and must be pushed manually (POST /products/:id/sync) or in
    //    bulk via the channels-page Sync action.
    let shopifyPushQueued = false;
    try {
      const productSettings = await this.settings.getProductSettings(orgId);
      if (productSettings.autoSyncToShopify) {
        const shopify = await this.prisma.channel.findUnique({
          where: {
            organizationId_platform: {
              organizationId: orgId,
              platform: ChannelPlatform.SHOPIFY,
            },
          },
        });
        if (shopify?.status === ChannelStatus.CONNECTED) {
          await this.shopifyPushEnqueuer.enqueueProductPush({
            type: 'product',
            productId: product.id,
            organizationId: orgId,
          });
          shopifyPushQueued = true;
          // Stamp PENDING immediately so the UI can show "Syncing…" before
          // the worker picks the job up.
          await this.prisma.product.update({
            where: { id: product.id },
            data: {
              metadata: {
                ...((product.metadata as Prisma.JsonObject) ?? {}),
                shopifySync: { status: 'PENDING', attempts: 0 },
              } as Prisma.InputJsonObject,
            },
          });
        }
      }
    } catch (err) {
      this.logger.warn(
        `Skipping Shopify push enqueue for product ${product.id}: ${err}`,
      );
    }

    return { ...product, shopifyPushQueued };
  }

  // ─── MANUAL SYNC TO SHOPIFY ───
  // Push a single MANUAL-channel product to the connected Shopify store on
  // demand. Idempotent — already-synced products return early; already-queued
  // ones don't re-enqueue; failed pushes are retried.
  async syncToShopify(id: string, orgId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: { channel: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    if (product.channel.platform !== ChannelPlatform.MANUAL) {
      throw new ForbiddenException(
        'Only CRM-native (MANUAL) products can be synced to Shopify. This product originated in Shopify.',
      );
    }

    const shopify = await this.prisma.channel.findUnique({
      where: {
        organizationId_platform: {
          organizationId: orgId,
          platform: ChannelPlatform.SHOPIFY,
        },
      },
    });
    if (!shopify || shopify.status !== ChannelStatus.CONNECTED) {
      throw new ForbiddenException(
        'No connected Shopify channel. Connect Shopify first, then sync.',
      );
    }

    const meta = (product.metadata as Prisma.JsonObject) ?? {};
    const sync = (meta.shopifySync ?? null) as
      | { status: 'PENDING' | 'SYNCED' | 'FAILED' }
      | null;

    if (sync?.status === 'SYNCED') {
      return { status: 'ALREADY_SYNCED' as const, productId: product.id };
    }
    if (sync?.status === 'PENDING') {
      return { status: 'ALREADY_QUEUED' as const, productId: product.id };
    }

    await this.shopifyPushEnqueuer.enqueueProductPush({
      type: 'product',
      productId: product.id,
      organizationId: orgId,
    });
    await this.prisma.product.update({
      where: { id: product.id },
      data: {
        metadata: {
          ...meta,
          shopifySync: { status: 'PENDING', attempts: 0 },
        } as Prisma.InputJsonObject,
      },
    });
    return { status: 'QUEUED' as const, productId: product.id };
  }

  // ─── UPDATE PRODUCT ───
  // Only MANUAL-channel products are editable from the CRM. Once a product
  // has been pushed to Shopify (channelId rebadged to SHOPIFY), this throws
  // 403 — Shopify becomes the source of truth and the existing read-direction
  // sync handles updates.
  async update(id: string, orgId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: { channel: true, variants: { orderBy: { position: 'asc' }, take: 1 } },
    });
    if (!product) throw new NotFoundException('Product not found');
    this.assertCrmEditable(product.channel.platform);

    return this.prisma.$transaction(async (tx) => {
      // Patch product-level fields.
      const productPatch: Prisma.ProductUpdateInput = {};
      if (dto.title !== undefined) productPatch.title = dto.title;
      if (dto.vendor !== undefined) productPatch.vendor = dto.vendor;
      if (dto.productType !== undefined)
        productPatch.productType = dto.productType;
      if (dto.status !== undefined) productPatch.status = dto.status;
      if (dto.tags !== undefined) productPatch.tags = dto.tags;
      if (dto.bodyHtml !== undefined) productPatch.bodyHtml = dto.bodyHtml;
      if (dto.hsnCode !== undefined) productPatch.hsnCode = dto.hsnCode;
      if (dto.gstRate !== undefined) productPatch.gstRate = dto.gstRate;

      if (Object.keys(productPatch).length > 0) {
        await tx.product.update({ where: { id }, data: productPatch });
      }

      // Patch the default variant if variant fields provided.
      if (dto.variant && product.variants[0]) {
        const variantPatch: Prisma.ProductVariantUpdateInput = {};
        if (dto.variant.price !== undefined)
          variantPatch.price = dto.variant.price;
        if (dto.variant.sku !== undefined) variantPatch.sku = dto.variant.sku;
        if (dto.variant.compareAtPrice !== undefined)
          variantPatch.compareAtPrice = dto.variant.compareAtPrice;
        if (dto.variant.inventoryQuantity !== undefined)
          variantPatch.inventoryQuantity = dto.variant.inventoryQuantity;

        if (Object.keys(variantPatch).length > 0) {
          await tx.productVariant.update({
            where: { id: product.variants[0].id },
            data: variantPatch,
          });
        }
      }

      return tx.product.findUnique({
        where: { id },
        include: {
          variants: { orderBy: { position: 'asc' } },
          images: { orderBy: { position: 'asc' } },
          channel: { select: { id: true, name: true, platform: true } },
        },
      });
    });
  }

  // ─── SOFT DELETE ───
  // Sets deletedAt — order line items keep their snapshot so history stays
  // intact. Only allowed for MANUAL-channel products (delete-from-Shopify is
  // out of scope for this cut).
  async softDelete(id: string, orgId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: { channel: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    this.assertCrmEditable(product.channel.platform);

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { id, deletedAt: new Date().toISOString() };
  }

  private assertCrmEditable(platform: ChannelPlatform) {
    if (platform !== ChannelPlatform.MANUAL) {
      throw new ForbiddenException(
        'Synced products are read-only in the CRM. Edit them on Shopify and re-sync.',
      );
    }
  }
}