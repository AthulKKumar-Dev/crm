import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ChannelPlatform,
  ChannelStatus,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { CreateOfflineOrderDto } from './dto/create-offline-order.dto';
import { QueryDashboardDto } from '../dashboard/dto/query-dashboard.dto';
import { Parser } from 'json2csv';
import { GstCalculatorService } from '../gst/gst-calculator.service';
import { TaxResolverService } from '../gst/tax-resolver.service';
import { InvoiceService } from '../invoice/invoice.service';
import { ShopifyPushEnqueuer } from '../channel/shopify-push.enqueuer';
import { ShopifyPushService } from '../channel/shopify-push.service';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: GstCalculatorService,
    private readonly taxResolver: TaxResolverService,
    private readonly invoiceService: InvoiceService,
    private readonly shopifyPushEnqueuer: ShopifyPushEnqueuer,
    private readonly shopifyPushService: ShopifyPushService,
  ) {}

  async findAll(orgId: string, query: QueryOrdersDto) {
    const where: Prisma.OrderWhereInput = {
      organizationId: orgId,
      deletedAt: null,
    };

    // Filter by financial status
    if (query.financialStatus) {
      where.financialStatus = query.financialStatus;
    }

    // Filter by fulfillment status
    if (query.fulfillmentStatus) {
      where.fulfillmentStatus = query.fulfillmentStatus;
    }

    // Filter by channel
    if (query.channelId) {
      where.channelId = query.channelId;
    }

    // Filter to orders containing a line item from a specific product
    // (drives "Recent sales" on the product detail page).
    if (query.productId) {
      where.lineItems = {
        some: { variant: { productId: query.productId } },
      };
    }

    // Filter to orders for a specific customer (drives the customer detail
    // page's order history if/when that lands).
    if (query.customerId) {
      where.customerId = query.customerId;
    }

    // Search by order number, customer name, or email
    if (query.search) {
      const searchTerm = query.search.trim();
      const orderNum = parseInt(searchTerm, 10);

      where.OR = [
        // Search by order number (if numeric)
        ...(isNaN(orderNum) ? [] : [{ orderNumber: orderNum }]),
        // Search by order name (#1001)
        { name: { contains: searchTerm, mode: 'insensitive' as const } },
        // Search by customer name
        {
          customer: {
            OR: [
              { firstName: { contains: searchTerm, mode: 'insensitive' as const } },
              { lastName: { contains: searchTerm, mode: 'insensitive' as const } },
              { email: { contains: searchTerm, mode: 'insensitive' as const } },
            ],
          },
        },
      ];
    }

    // Date range filter
    if (query.dateFrom || query.dateTo) {
      where.externalCreatedAt = {};
      if (query.dateFrom) where.externalCreatedAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.externalCreatedAt.lte = new Date(query.dateTo);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // Determine sort field
    const sortBy = query.sortBy ?? 'externalCreatedAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          customer: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          channel: {
            select: { id: true, name: true, platform: true },
          },
          _count: {
            select: { lineItems: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: data.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        name: order.name,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        currency: order.currency,
        totalPrice: order.totalPrice,
        subtotalPrice: order.subtotalPrice,
        totalTax: order.totalTax,
        totalDiscounts: order.totalDiscounts,
        totalShippingPrice: order.totalShippingPrice,
        tags: order.tags,
        note: order.note,
        cancelReason: order.cancelReason,
        cancelledAt: order.cancelledAt,
        createdAt: order.externalCreatedAt || order.createdAt,
        customer: order.customer,
        channel: order.channel,
        itemCount: order._count.lineItems,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, orgId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        customer: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, defaultAddress: true },
        },
        channel: {
          select: { id: true, name: true, platform: true },
        },
        lineItems: {
          include: {
            variant: {
              select: { id: true, title: true, sku: true, price: true },
            },
          },
        },
        fulfillments: true,
        refunds: true,
        timeline: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async getComparison(orgId: string, query: QueryDashboardDto) {
    // Determine current and previous periods
    const now = new Date();
    const currentStart = query.dateFrom ? new Date(query.dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
    const currentEnd = query.dateTo ? new Date(query.dateTo) : now;

    // Previous period = same duration, shifted back
    const duration = currentEnd.getTime() - currentStart.getTime();
    const previousStart = new Date(currentStart.getTime() - duration);
    const previousEnd = new Date(currentStart.getTime() - 1); // 1ms before current period starts

    const channelFilter = query.channelId ? { channelId: query.channelId } : {};

    const [
      currentOrders,
      previousOrders,
      currentPendingOrders,
      previousPendingOrders,
      currentSales,
      previousSales,
      currentProductsSold,
      previousProductsSold,
    ] = await Promise.all([
      // Total new orders (current period)
      this.prisma.order.count({
        where: {
          organizationId: orgId, deletedAt: null, ...channelFilter,
          externalCreatedAt: { gte: currentStart, lte: currentEnd },
        },
      }),
      // Total new orders (previous period)
      this.prisma.order.count({
        where: {
          organizationId: orgId, deletedAt: null, ...channelFilter,
          externalCreatedAt: { gte: previousStart, lte: previousEnd },
        },
      }),

      // Pending orders (current period)
      this.prisma.order.count({
        where: {
          organizationId: orgId, deletedAt: null, ...channelFilter,
          fulfillmentStatus: 'UNFULFILLED',
          externalCreatedAt: { gte: currentStart, lte: currentEnd },
        },
      }),
      // Pending orders (previous period)
      this.prisma.order.count({
        where: {
          organizationId: orgId, deletedAt: null, ...channelFilter,
          fulfillmentStatus: 'UNFULFILLED',
          externalCreatedAt: { gte: previousStart, lte: previousEnd },
        },
      }),

      // Total sales revenue (current period)
      this.prisma.order.aggregate({
        where: {
          organizationId: orgId, deletedAt: null, ...channelFilter,
          financialStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
          externalCreatedAt: { gte: currentStart, lte: currentEnd },
        },
        _sum: { totalPrice: true },
      }),
      // Total sales revenue (previous period)
      this.prisma.order.aggregate({
        where: {
          organizationId: orgId, deletedAt: null, ...channelFilter,
          financialStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
          externalCreatedAt: { gte: previousStart, lte: previousEnd },
        },
        _sum: { totalPrice: true },
      }),

      // Total products sold / volume (current period)
      this.prisma.orderLineItem.aggregate({
        where: {
          order: {
            organizationId: orgId, deletedAt: null, ...channelFilter,
            externalCreatedAt: { gte: currentStart, lte: currentEnd },
          },
        },
        _sum: { quantity: true },
      }),
      // Total products sold / volume (previous period)
      this.prisma.orderLineItem.aggregate({
        where: {
          order: {
            organizationId: orgId, deletedAt: null, ...channelFilter,
            externalCreatedAt: { gte: previousStart, lte: previousEnd },
          },
        },
        _sum: { quantity: true },
      }),
    ]);

    return {
      period: {
        current: { from: currentStart.toISOString(), to: currentEnd.toISOString() },
        previous: { from: previousStart.toISOString(), to: previousEnd.toISOString() },
      },

      totalNewOrders: {
        current: currentOrders,
        previous: previousOrders,
        change: this.calcChange(currentOrders, previousOrders),
      },

      pendingOrders: {
        current: currentPendingOrders,
        previous: previousPendingOrders,
        change: this.calcChange(currentPendingOrders, previousPendingOrders),
      },

      totalSales: {
        current: currentSales._sum.totalPrice ?? 0,
        previous: previousSales._sum.totalPrice ?? 0,
        change: this.calcChange(
          Number(currentSales._sum.totalPrice ?? 0),
          Number(previousSales._sum.totalPrice ?? 0),
        ),
      },

      totalProductsSold: {
        current: currentProductsSold._sum.quantity ?? 0,
        previous: previousProductsSold._sum.quantity ?? 0,
        change: this.calcChange(
          currentProductsSold._sum.quantity ?? 0,
          previousProductsSold._sum.quantity ?? 0,
        ),
      },
    };
  }

  async getExportData(orgId: string, query: QueryOrdersDto) {
    const where: Prisma.OrderWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      ...(query.financialStatus && { financialStatus: query.financialStatus }),
      ...(query.fulfillmentStatus && { fulfillmentStatus: query.fulfillmentStatus }),
      ...(query.channelId && { channelId: query.channelId }),
      ...((query.dateFrom || query.dateTo) && {
        externalCreatedAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
    };

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        lineItems: { select: { title: true, quantity: true, price: true } },
        channel: { select: { name: true } },
      },
      orderBy: { externalCreatedAt: 'desc' },
    });

    return orders.map((o) => ({
      orderNumber: o.orderNumber,
      name: o.name,
      date: (o.externalCreatedAt || o.createdAt).toISOString(),
      customer: o.customer ? `${o.customer.firstName || ''} ${o.customer.lastName || ''}`.trim() : 'Guest',
      email: o.customer?.email || '',
      channel: o.channel?.name || '',
      items: o.lineItems.map((li) => `${li.title} x${li.quantity}`).join('; '),
      itemCount: o.lineItems.length,
      subtotal: o.subtotalPrice.toString(),
      tax: o.totalTax.toString(),
      shipping: o.totalShippingPrice.toString(),
      discounts: o.totalDiscounts.toString(),
      total: o.totalPrice.toString(),
      currency: o.currency,
      financialStatus: o.financialStatus,
      fulfillmentStatus: o.fulfillmentStatus,
    }));
  }

  generateCsv(data: any[]): string {
    const fields = [
      'orderNumber', 'name', 'date', 'customer', 'email', 'channel',
      'items', 'itemCount', 'subtotal', 'tax', 'shipping', 'discounts',
      'total', 'currency', 'financialStatus', 'fulfillmentStatus',
    ];
    const parser = new Parser({ fields });
    return parser.parse(data);
  }

  private calcChange(current: number, previous: number): { percentage: number; direction: 'up' | 'down' | 'same' } {
    if (previous === 0 && current === 0) return { percentage: 0, direction: 'same' };
    if (previous === 0) return { percentage: 100, direction: 'up' };
    const percentage = Math.round(((current - previous) / previous) * 100);
    return {
      percentage: Math.abs(percentage),
      direction: percentage > 0 ? 'up' : percentage < 0 ? 'down' : 'same',
    };
  }

  // ─── OFFLINE / IN-STORE ORDER CREATION ───
  // Creates a manual order from a merchant's physical counter sale:
  // resolves/creates customer, validates and decrements stock, snapshots
  // line items, computes GST, and (when configured) generates the invoice
  // — all in a single Serializable transaction so a partial failure rolls
  // back cleanly.
  async createOfflineOrder(
    orgId: string,
    userId: string,
    dto: CreateOfflineOrderDto,
  ) {
    const variantIds = dto.lineItems.map((li) => li.productVariantId);
    if (new Set(variantIds).size !== variantIds.length) {
      throw new BadRequestException(
        'Duplicate variant IDs are not allowed; merge them into a single line item.',
      );
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        // 1. Resolve or lazy-create the org's MANUAL channel.
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

        // 2. Resolve customer (existing by id/email/phone, else create).
        const customer = await this.resolveCustomer(tx, orgId, channel.id, dto);

        // 3. Fetch variants. Stock validation/decrement is intentionally NOT
        //    done here yet — that will be added in a follow-up. For now, we
        //    only need product info for line-item snapshots and tax math.
        const variants = await tx.productVariant.findMany({
          where: {
            id: { in: variantIds },
            product: { organizationId: orgId },
          },
          include: { product: true },
        });

        const variantById = new Map(variants.map((v) => [v.id, v]));
        const missing = variantIds.filter((id) => !variantById.has(id));
        if (missing.length > 0) {
          throw new NotFoundException(
            `Product variants not found: ${missing.join(', ')}`,
          );
        }

        // 4. Resolve seller GSTIN (only required when invoice generation is on).
        const generateInvoice = dto.generateInvoice !== false;
        const org = await tx.organization.findUnique({
          where: { id: orgId },
          select: { gstEnabled: true, currency: true },
        });
        if (!org) {
          throw new NotFoundException('Organization not found');
        }

        let sellerGstin: { stateCode: string } | null = null;
        if (generateInvoice && org.gstEnabled) {
          if (dto.sellerGstinId) {
            sellerGstin = await tx.organizationGstin.findFirst({
              where: {
                id: dto.sellerGstinId,
                organizationId: orgId,
                isActive: true,
              },
              select: { stateCode: true },
            });
          } else {
            sellerGstin = await tx.organizationGstin.findFirst({
              where: { organizationId: orgId, isDefault: true, isActive: true },
              select: { stateCode: true },
            });
          }
        }

        // 5. Compute pricing per line item.
        const placeOfSupplyCode =
          dto.placeOfSupplyCode ||
          dto.customer.billingStateCode ||
          customer.billingStateCode ||
          sellerGstin?.stateCode ||
          '00';

        const isIntraState = sellerGstin
          ? this.calculator.isIntraState(
              sellerGstin.stateCode,
              placeOfSupplyCode,
            )
          : true;

        const lineItemsToCreate: Array<{
          variantId: string;
          title: string;
          variantTitle: string | null;
          sku: string | null;
          quantity: number;
          unitPrice: number;
          totalDiscount: number;
          lineTotal: number;
          taxAmount: number;
        }> = [];

        let subtotal = 0;
        let totalTax = 0;

        for (const li of dto.lineItems) {
          const v = variantById.get(li.productVariantId)!;
          const unitPrice =
            li.unitPriceOverride ?? this.calculator.toNumber(v.price);
          const discount = li.discount ?? 0;

          const productGstRate = this.calculator.toNumber(v.product.gstRate);
          const gstRate = sellerGstin
            ? await this.taxResolver.resolveGstRate(
                orgId,
                v.product.id,
                productGstRate || null,
                placeOfSupplyCode,
              )
            : 0;

          const calc = this.calculator.calculateLineItem(
            { unitPrice, quantity: li.quantity, discount, gstRate },
            isIntraState,
          );

          subtotal += calc.taxableValue;
          totalTax += calc.totalTax;

          lineItemsToCreate.push({
            variantId: v.id,
            title: v.product.title,
            variantTitle: v.title || null,
            sku: v.sku ?? null,
            quantity: li.quantity,
            unitPrice,
            totalDiscount: discount,
            lineTotal: calc.totalAmount,
            taxAmount: calc.totalTax,
          });
        }

        const round = (n: number) => Math.round(n * 100) / 100;
        subtotal = round(subtotal);
        totalTax = round(totalTax);
        const grandTotal = round(subtotal + totalTax);

        // 6. Generate next sequential orderNumber. Serializable isolation +
        //    @@unique([channelId, externalId]) keep this collision-free under
        //    concurrency; the runtime will retry on serialization conflict.
        const last = await tx.order.findFirst({
          where: { organizationId: orgId },
          orderBy: { orderNumber: 'desc' },
          select: { orderNumber: true },
        });
        const nextNumber = (last?.orderNumber ?? 1000) + 1;

        // 7. Create the order with line items in a nested write.
        const now = new Date();
        const order = await tx.order.create({
          data: {
            organizationId: orgId,
            channelId: channel.id,
            customerId: customer.id,
            externalId: `manual_${randomUUID()}`,
            orderNumber: nextNumber,
            name: `#${nextNumber}`,
            financialStatus:
              dto.financialStatus ?? OrderFinancialStatus.PAID,
            fulfillmentStatus:
              dto.fulfillmentStatus ?? OrderFulfillmentStatus.FULFILLED,
            currency: org.currency || 'INR',
            subtotalPrice: subtotal,
            totalPrice: grandTotal,
            totalTax,
            totalDiscounts: 0,
            totalShippingPrice: 0,
            note: dto.note,
            metadata: {
              source: 'offline',
              paymentMethod: dto.paymentMethod,
              createdByUserId: userId,
            },
            externalCreatedAt: now,
            lineItems: {
              create: lineItemsToCreate.map((li) => ({
                variantId: li.variantId,
                externalId: `manual_${randomUUID()}`,
                title: li.title,
                variantTitle: li.variantTitle,
                sku: li.sku,
                quantity: li.quantity,
                price: li.unitPrice,
                totalDiscount: li.totalDiscount,
                taxable: true,
                requiresShipping: false,
              })),
            },
          },
          include: { lineItems: true },
        });

        // 8. (Inventory decrement intentionally deferred — see step 3 note.)

        // 9. Update customer denormalized counters.
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            ordersCount: { increment: 1 },
            totalSpent: { increment: grandTotal },
          },
        });

        // 10. Timeline event.
        await tx.orderTimelineEvent.create({
          data: {
            orderId: order.id,
            actorId: userId,
            action: 'created',
            message: `Offline order created (${dto.paymentMethod})`,
          },
        });

        // 11. Generate invoice inline (soft-fail if GST isn't configured).
        let invoice: Awaited<
          ReturnType<typeof this.invoiceService.createForOrderTx>
        > | null = null;
        let invoiceError: string | null = null;

        if (generateInvoice && org.gstEnabled && sellerGstin) {
          try {
            invoice = await this.invoiceService.createForOrderTx(
              tx,
              orgId,
              order.id,
              {
                sellerGstinId: dto.sellerGstinId,
                placeOfSupplyCode: dto.placeOfSupplyCode,
                notes: dto.note,
              },
            );
          } catch (err) {
            // Soft-fail: a missing GST detail (no seller GSTIN, etc.) must not
            // block a walk-in sale. Log it and proceed; the merchant can issue
            // the invoice later from the order detail page.
            invoiceError =
              err instanceof Error ? err.message : 'Invoice generation failed.';
            this.logger.warn(
              `Invoice soft-fail for offline order ${order.id}: ${invoiceError}`,
            );
            invoice = null;
          }
        } else if (generateInvoice && org.gstEnabled && !sellerGstin) {
          invoiceError =
            'No GSTIN registration found. Add one in Settings → Tax & GST.';
        } else if (generateInvoice && !org.gstEnabled) {
          invoiceError = 'GST is not enabled for this organization.';
        }

        return { order, invoice, invoiceError };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      },
    );

    // After the local order commits, enqueue a Shopify push if the org has a
    // connected Shopify channel. We do this OUTSIDE the transaction so a
    // queue/Redis hiccup never rolls back the local sale. The job runs in
    // the background; failures are recorded on `order.metadata.shopifySync`
    // and retried with exponential backoff (5 attempts).
    try {
      const shopifyChannel = await this.shopifyPushService.findShopifyChannel(
        orgId,
      );
      if (shopifyChannel?.status === 'CONNECTED') {
        // Mark as PENDING immediately so the UI shows "Syncing to Shopify…"
        // even before the worker picks the job up.
        await this.markPendingSync(result.order.id);
        await this.shopifyPushEnqueuer.enqueueOrderPush({
          type: 'order',
          orderId: result.order.id,
          organizationId: orgId,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Skipping Shopify push enqueue for order ${result.order.id}: ${err}`,
      );
    }

    return result;
  }

  /** Stamp metadata.shopifySync = { status: 'PENDING', attempts: 0 }. */
  private async markPendingSync(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { metadata: true },
    });
    const meta =
      order?.metadata && typeof order.metadata === 'object' && !Array.isArray(order.metadata)
        ? (order.metadata as Prisma.JsonObject)
        : {};
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        metadata: {
          ...meta,
          shopifySync: { status: 'PENDING', attempts: 0 },
        } as Prisma.InputJsonObject,
      },
    });
  }

  private async resolveCustomer(
    tx: Prisma.TransactionClient,
    orgId: string,
    manualChannelId: string,
    dto: CreateOfflineOrderDto,
  ) {
    const input = dto.customer;

    if (input.customerId) {
      const existing = await tx.customer.findFirst({
        where: { id: input.customerId, organizationId: orgId },
      });
      if (!existing) {
        throw new NotFoundException('Customer not found');
      }
      return existing;
    }

    if (input.email) {
      const byEmail = await tx.customer.findFirst({
        where: { organizationId: orgId, email: input.email },
      });
      if (byEmail) {
        return this.fillMissingCustomerFields(tx, byEmail, input);
      }
    }

    if (input.phone) {
      const byPhone = await tx.customer.findFirst({
        where: { organizationId: orgId, phone: input.phone },
      });
      if (byPhone) {
        return this.fillMissingCustomerFields(tx, byPhone, input);
      }
    }

    if (!input.email && !input.phone && !input.firstName && !input.lastName) {
      throw new BadRequestException(
        'Customer details required: provide at least one of customerId, email, phone, or a name.',
      );
    }

    return tx.customer.create({
      data: {
        organizationId: orgId,
        channelId: manualChannelId,
        externalId: `manual_${randomUUID()}`,
        email: input.email ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        phone: input.phone ?? null,
        gstin: input.gstin ?? null,
        billingStateCode: input.billingStateCode ?? null,
        ...(input.address
          ? {
              addresses: [input.address] as Prisma.InputJsonValue,
              defaultAddress: input.address as Prisma.InputJsonValue,
            }
          : {}),
      },
    });
  }

  private async fillMissingCustomerFields(
    tx: Prisma.TransactionClient,
    existing: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      gstin: string | null;
      billingStateCode: string | null;
    },
    input: CreateOfflineOrderDto['customer'],
  ) {
    const patch: Prisma.CustomerUpdateInput = {};
    if (!existing.firstName && input.firstName) patch.firstName = input.firstName;
    if (!existing.lastName && input.lastName) patch.lastName = input.lastName;
    if (!existing.gstin && input.gstin) patch.gstin = input.gstin;
    if (!existing.billingStateCode && input.billingStateCode) {
      patch.billingStateCode = input.billingStateCode;
    }

    if (Object.keys(patch).length === 0) {
      return existing;
    }

    return tx.customer.update({ where: { id: existing.id }, data: patch });
  }
}