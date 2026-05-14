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
import { UpdateOrderDto } from './dto/update-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CapturePaymentDto } from './dto/capture-payment.dto';
import { CreateFulfillmentDto } from './dto/create-fulfillment.dto';
import { UpdateTrackingDto } from './dto/update-tracking.dto';
import { QueryDashboardDto } from '../dashboard/dto/query-dashboard.dto';
import { Parser } from 'json2csv';
import { GstCalculatorService } from '../gst/gst-calculator.service';
import { TaxResolverService } from '../gst/tax-resolver.service';
import { InvoiceService } from '../invoice/invoice.service';
import { ShopifyPushEnqueuer } from '../channel/shopify-push.enqueuer';
import { ShopifyPushService } from '../channel/shopify-push.service';
import { ShopifyGraphqlClient } from '../channel/shopify-graphql.client';
import { ShopifyOAuthService } from '../channel/shopify-oauth.service';
import { OrganizationSettingsService } from '../organization-settings/organization-settings.service';
import {
  FulfillmentCancelResponse,
  FulfillmentCancelVariables,
  FulfillmentCreateResponse,
  FulfillmentCreateVariables,
  FulfillmentTrackingInfoUpdateResponse,
  FulfillmentTrackingInfoUpdateVariables,
  MailingAddressInput,
  OrderCancelResponse,
  OrderCancelVariables,
  OrderCapturableTransactionsResponse,
  OrderCapturableTransactionsVariables,
  OrderCaptureResponse,
  OrderCaptureVariables,
  OrderCloseOrOpenVariables,
  OrderCloseResponse,
  OrderFulfillmentOrdersResponse,
  OrderMarkAsPaidResponse,
  OrderMarkAsPaidVariables,
  OrderOpenResponse,
  OrderUpdateInput,
  OrderUpdateResponse,
  OrderUpdateVariables,
  FULFILLMENT_CANCEL_MUTATION,
  FULFILLMENT_CREATE_MUTATION,
  FULFILLMENT_TRACKING_INFO_UPDATE_MUTATION,
  ORDER_CANCEL_MUTATION,
  ORDER_CAPTURABLE_TRANSACTIONS_QUERY,
  ORDER_CAPTURE_MUTATION,
  ORDER_CLOSE_MUTATION,
  ORDER_FULFILLMENT_ORDERS_QUERY,
  ORDER_MARK_AS_PAID_MUTATION,
  ORDER_OPEN_MUTATION,
  ORDER_UPDATE_MUTATION,
} from '../channel/shopify-graphql.types';

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
    private readonly graphql: ShopifyGraphqlClient,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly settings: OrganizationSettingsService,
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

    // Auto-push to Shopify — only if the org has opted in via
    // orderSettings.autoSyncToShopify. Default is OFF: offline orders stay
    // local and must be pushed manually (POST /orders/:id/sync) or in bulk
    // via the channels-page Sync action.
    // OUTSIDE the transaction so a queue/Redis hiccup never rolls back the
    // local sale.
    try {
      const orderSettings = await this.settings.getOrderSettings(orgId);
      if (orderSettings.autoSyncToShopify) {
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
      }
    } catch (err) {
      this.logger.warn(
        `Skipping Shopify push enqueue for order ${result.order.id}: ${err}`,
      );
    }

    return result;
  }

  // ─── MANUAL SYNC TO SHOPIFY ───
  // Push a single MANUAL offline order to the connected Shopify store on
  // demand. Idempotent — already-synced orders return early; already-queued
  // ones don't re-enqueue; failed pushes are retried.
  async syncToShopify(id: string, orgId: string) {
    const order = await this.loadOrderWithChannel(id, orgId);

    if (order.channel.platform !== ChannelPlatform.MANUAL) {
      throw new BadRequestException(
        'Only offline (MANUAL channel) orders can be synced to Shopify. This order originated in Shopify.',
      );
    }

    const shopifyChannel = await this.shopifyPushService.findShopifyChannel(orgId);
    if (!shopifyChannel || shopifyChannel.status !== ChannelStatus.CONNECTED) {
      throw new BadRequestException(
        'No connected Shopify channel. Connect Shopify first, then sync.',
      );
    }

    const meta = (order.metadata as Prisma.JsonObject) ?? {};
    const sync = (meta.shopifySync ?? null) as
      | { status: 'PENDING' | 'SYNCED' | 'FAILED' }
      | null;

    if (sync?.status === 'SYNCED') {
      return { status: 'ALREADY_SYNCED' as const, orderId: order.id };
    }
    if (sync?.status === 'PENDING') {
      return { status: 'ALREADY_QUEUED' as const, orderId: order.id };
    }

    await this.markPendingSync(order.id);
    await this.shopifyPushEnqueuer.enqueueOrderPush({
      type: 'order',
      orderId: order.id,
      organizationId: orgId,
    });
    return { status: 'QUEUED' as const, orderId: order.id };
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

  // ─── PHASE 1: LIFECYCLE & METADATA ────────────────────────────────────────
  // Each operation branches on `order.channel.platform`:
  //   - SHOPIFY: call the matching GraphQL mutation, then mirror to DB.
  //   - MANUAL:  apply locally only.
  // A timeline event is written on every successful action so the order
  // detail page renders an audit trail regardless of channel.

  /**
   * Edit metadata on an existing order: tags, note, customer contact, address,
   * custom attributes. For SHOPIFY, fields propagate via `orderUpdate`. For
   * MANUAL, only fields with a local column are persisted (others are accepted
   * but ignored — they're meaningful only when there's a Shopify mirror).
   */
  async update(id: string, orgId: string, userId: string, dto: UpdateOrderDto) {
    const order = await this.loadOrderWithChannel(id, orgId);
    const isShopify = order.channel.platform === ChannelPlatform.SHOPIFY;

    if (isShopify) {
      const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(order.channel.id);
      const input: OrderUpdateInput = {
        id: ShopifyGraphqlClient.toGid('Order', order.externalId),
      };
      if (dto.tags !== undefined) input.tags = dto.tags;
      if (dto.note !== undefined) input.note = dto.note;
      if (dto.email !== undefined) input.email = dto.email;
      if (dto.phone !== undefined) input.phone = dto.phone;
      if (dto.poNumber !== undefined) input.poNumber = dto.poNumber;
      if (dto.customAttributes !== undefined) input.customAttributes = dto.customAttributes;
      if (dto.shippingAddress !== undefined) {
        input.shippingAddress = this.toShopifyAddress(dto.shippingAddress);
      }
      const result = await this.graphql.request<OrderUpdateResponse, OrderUpdateVariables>(
        { shopDomain, accessToken: token },
        ORDER_UPDATE_MUTATION,
        { input },
      );
      ShopifyGraphqlClient.throwIfUserErrors(result.orderUpdate.userErrors, 'orderUpdate');
    }

    const updatedFields = Object.keys(dto).filter(
      (k) => (dto as Record<string, unknown>)[k] !== undefined,
    );

    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.OrderUpdateInput = {};
      if (dto.tags !== undefined) data.tags = dto.tags;
      if (dto.note !== undefined) data.note = dto.note;
      if (dto.shippingAddress !== undefined) {
        data.shippingAddress = dto.shippingAddress as Prisma.InputJsonValue;
      }
      if (dto.billingAddress !== undefined) {
        data.billingAddress = dto.billingAddress as Prisma.InputJsonValue;
      }
      const updated = Object.keys(data).length > 0
        ? await tx.order.update({ where: { id }, data })
        : order;

      await tx.orderTimelineEvent.create({
        data: {
          orderId: id,
          actorId: userId,
          action: 'updated',
          message: `Order details updated (${updatedFields.join(', ') || 'no changes'})`,
          metadata: { updatedFields } as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
  }

  /**
   * Cancel an order. Shopify's `orderCancel` is async — it returns a Job and
   * the actual cancellation happens in the background. We apply an optimistic
   * local update (cancelledAt, cancelReason, optional refund/restock status)
   * and rely on the `orders/cancelled` webhook to reconcile fully.
   */
  async cancel(id: string, orgId: string, userId: string, dto: CancelOrderDto) {
    const order = await this.loadOrderWithChannel(id, orgId);
    if (order.cancelledAt) {
      throw new BadRequestException('Order is already cancelled');
    }
    const isShopify = order.channel.platform === ChannelPlatform.SHOPIFY;

    if (isShopify) {
      const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(order.channel.id);
      const variables: OrderCancelVariables = {
        orderId: ShopifyGraphqlClient.toGid('Order', order.externalId),
        reason: dto.reason,
        refund: dto.refund ?? false,
        restock: dto.restock ?? true,
        notifyCustomer: dto.notifyCustomer ?? true,
        staffNote: dto.staffNote ?? null,
      };
      const result = await this.graphql.request<OrderCancelResponse, OrderCancelVariables>(
        { shopDomain, accessToken: token },
        ORDER_CANCEL_MUTATION,
        variables,
      );
      ShopifyGraphqlClient.throwIfUserErrors(
        result.orderCancel.orderCancelUserErrors,
        'orderCancel',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.OrderUpdateInput = {
        cancelReason: dto.reason,
        cancelledAt: new Date(),
      };
      if (dto.refund) data.financialStatus = OrderFinancialStatus.REFUNDED;
      if (dto.restock) data.fulfillmentStatus = OrderFulfillmentStatus.RESTOCKED;
      const updated = await tx.order.update({ where: { id }, data });
      await tx.orderTimelineEvent.create({
        data: {
          orderId: id,
          actorId: userId,
          action: 'cancelled',
          message: `Order cancelled (${dto.reason})${dto.staffNote ? `: ${dto.staffNote}` : ''}`,
          metadata: {
            reason: dto.reason,
            refund: dto.refund ?? false,
            restock: dto.restock ?? true,
            notifyCustomer: dto.notifyCustomer ?? true,
          } as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
  }

  /** Archive (close) an order. Reversible via `open()`. */
  async close(id: string, orgId: string, userId: string) {
    const order = await this.loadOrderWithChannel(id, orgId);
    if (order.closedAt) {
      throw new BadRequestException('Order is already closed');
    }
    const isShopify = order.channel.platform === ChannelPlatform.SHOPIFY;

    if (isShopify) {
      const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(order.channel.id);
      const result = await this.graphql.request<OrderCloseResponse, OrderCloseOrOpenVariables>(
        { shopDomain, accessToken: token },
        ORDER_CLOSE_MUTATION,
        { input: { id: ShopifyGraphqlClient.toGid('Order', order.externalId) } },
      );
      ShopifyGraphqlClient.throwIfUserErrors(result.orderClose.userErrors, 'orderClose');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: { closedAt: new Date() },
      });
      await tx.orderTimelineEvent.create({
        data: { orderId: id, actorId: userId, action: 'closed', message: 'Order archived' },
      });
      return updated;
    });
  }

  /** Un-archive (reopen) a previously closed order. */
  async open(id: string, orgId: string, userId: string) {
    const order = await this.loadOrderWithChannel(id, orgId);
    if (!order.closedAt) {
      throw new BadRequestException('Order is already open');
    }
    const isShopify = order.channel.platform === ChannelPlatform.SHOPIFY;

    if (isShopify) {
      const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(order.channel.id);
      const result = await this.graphql.request<OrderOpenResponse, OrderCloseOrOpenVariables>(
        { shopDomain, accessToken: token },
        ORDER_OPEN_MUTATION,
        { input: { id: ShopifyGraphqlClient.toGid('Order', order.externalId) } },
      );
      ShopifyGraphqlClient.throwIfUserErrors(result.orderOpen.userErrors, 'orderOpen');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: { closedAt: null },
      });
      await tx.orderTimelineEvent.create({
        data: { orderId: id, actorId: userId, action: 'reopened', message: 'Order re-opened' },
      });
      return updated;
    });
  }

  /** Mark an outstanding order as paid (e.g. cash-on-delivery, wire, COD). */
  async markPaid(id: string, orgId: string, userId: string) {
    const order = await this.loadOrderWithChannel(id, orgId);
    if (order.financialStatus === OrderFinancialStatus.PAID) {
      throw new BadRequestException('Order is already paid');
    }
    const isShopify = order.channel.platform === ChannelPlatform.SHOPIFY;

    if (isShopify) {
      const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(order.channel.id);
      const result = await this.graphql.request<
        OrderMarkAsPaidResponse,
        OrderMarkAsPaidVariables
      >(
        { shopDomain, accessToken: token },
        ORDER_MARK_AS_PAID_MUTATION,
        { input: { id: ShopifyGraphqlClient.toGid('Order', order.externalId) } },
      );
      ShopifyGraphqlClient.throwIfUserErrors(
        result.orderMarkAsPaid.userErrors,
        'orderMarkAsPaid',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: { financialStatus: OrderFinancialStatus.PAID },
      });
      await tx.orderTimelineEvent.create({
        data: { orderId: id, actorId: userId, action: 'paid', message: 'Order marked as paid' },
      });
      return updated;
    });
  }

  /**
   * Capture an authorized payment. Only valid for SHOPIFY orders — MANUAL
   * orders don't have an authorize/capture cycle; use `markPaid` instead.
   *
   * Flow for Shopify:
   *   1. Query the order's transactions to find a successful AUTHORIZATION.
   *   2. Call `orderCapture` against that transaction.
   *   3. Mirror the financialStatus locally (the orders/updated webhook also
   *      fires and reconciles within seconds).
   */
  async capture(id: string, orgId: string, userId: string, dto: CapturePaymentDto) {
    const order = await this.loadOrderWithChannel(id, orgId);
    if (
      order.financialStatus === OrderFinancialStatus.PAID ||
      order.financialStatus === OrderFinancialStatus.REFUNDED
    ) {
      throw new BadRequestException('Order has no capturable balance');
    }
    if (order.channel.platform !== ChannelPlatform.SHOPIFY) {
      throw new BadRequestException(
        'Manual orders have no authorize/capture cycle. Use mark-paid instead.',
      );
    }

    const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(order.channel.id);
    const auth = { shopDomain, accessToken: token };
    const gid = ShopifyGraphqlClient.toGid('Order', order.externalId);

    const txResp = await this.graphql.request<
      OrderCapturableTransactionsResponse,
      OrderCapturableTransactionsVariables
    >(auth, ORDER_CAPTURABLE_TRANSACTIONS_QUERY, { id: gid });

    const authTx = txResp.order?.transactions.find(
      (t) => t.kind === 'AUTHORIZATION' && t.status === 'SUCCESS',
    );
    if (!authTx) {
      throw new BadRequestException(
        'No authorize transaction available to capture against this order.',
      );
    }

    const amountStr =
      dto.amount !== undefined ? dto.amount.toFixed(2) : authTx.amountSet.shopMoney.amount;

    const capResp = await this.graphql.request<OrderCaptureResponse, OrderCaptureVariables>(
      auth,
      ORDER_CAPTURE_MUTATION,
      {
        input: {
          id: gid,
          parentTransactionId: authTx.id,
          amount: amountStr,
          currency: dto.currency ?? authTx.amountSet.shopMoney.currencyCode,
          finalCapture: dto.finalCapture ?? false,
        },
      },
    );
    ShopifyGraphqlClient.throwIfUserErrors(capResp.orderCapture.userErrors, 'orderCapture');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: { financialStatus: OrderFinancialStatus.PAID },
      });
      await tx.orderTimelineEvent.create({
        data: {
          orderId: id,
          actorId: userId,
          action: 'captured',
          message: `Payment captured (${amountStr} ${dto.currency ?? authTx.amountSet.shopMoney.currencyCode})`,
          metadata: {
            transactionId: capResp.orderCapture.transaction?.id ?? null,
            amount: amountStr,
            finalCapture: dto.finalCapture ?? false,
          } as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
  }

  // ─── PHASE 2: FULFILLMENT & TRACKING ──────────────────────────────────────
  // Three actions: create a fulfillment (mark items shipped + tracking),
  // update tracking on an existing fulfillment, cancel a fulfillment.
  // SHOPIFY orders round-trip via the matching GraphQL mutations and the
  // fulfillments/* + orders/fulfilled webhooks reconcile state. MANUAL orders
  // are purely local — the OrderFulfillment row and the per-line-item
  // `fulfillmentStatus` column carry the truth.

  /**
   * Return the line items still available to fulfill. For Shopify this calls
   * `order.fulfillmentOrders` and flattens the open FOs into a UI-friendly
   * shape (preserving the FO id so the UI doesn't need to know about it,
   * but `createFulfillment` can recover it from the line item ID). For
   * manual orders it just lists local line items not yet marked fulfilled.
   */
  async listFulfillableLineItems(orderId: string, orgId: string) {
    const order = await this.loadOrderWithChannel(orderId, orgId);

    if (order.channel.platform === ChannelPlatform.SHOPIFY) {
      const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(order.channel.id);
      const resp = await this.graphql.request<
        OrderFulfillmentOrdersResponse,
        { id: string }
      >(
        { shopDomain, accessToken: token },
        ORDER_FULFILLMENT_ORDERS_QUERY,
        { id: ShopifyGraphqlClient.toGid('Order', order.externalId) },
      );
      const fos = resp.order?.fulfillmentOrders.nodes ?? [];
      return {
        source: 'shopify' as const,
        fulfillmentOrders: fos.map((fo) => ({
          id: fo.id,
          status: fo.status,
          locationName: fo.assignedLocation?.name ?? null,
          lineItems: fo.lineItems.nodes.map((li) => ({
            // `lineItemId` is the OrderLineItem numeric ID; that's what the
            // create-fulfillment endpoint accepts. The internal FO line item
            // ID is resolved server-side from it.
            lineItemId: ShopifyGraphqlClient.extractId(li.lineItem.id),
            title: li.lineItem.title,
            variantTitle: li.lineItem.variantTitle,
            sku: li.lineItem.sku,
            remainingQuantity: li.remainingQuantity,
            totalQuantity: li.totalQuantity,
          })),
        })),
      };
    }

    const lineItems = await this.prisma.orderLineItem.findMany({
      where: { orderId, fulfillmentStatus: { not: 'fulfilled' } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      source: 'manual' as const,
      fulfillmentOrders: [
        {
          id: 'manual',
          status: 'OPEN',
          locationName: null,
          lineItems: lineItems.map((li) => ({
            lineItemId: li.id,
            title: li.title,
            variantTitle: li.variantTitle,
            sku: li.sku,
            remainingQuantity: li.quantity,
            totalQuantity: li.quantity,
          })),
        },
      ],
    };
  }

  /**
   * Create a fulfillment for the selected line items with optional tracking.
   *
   * For SHOPIFY: queries the order's fulfillment orders, maps each requested
   * line item to its FO line item, groups by FO, and calls `fulfillmentCreate`.
   * The fulfillments/create + orders/fulfilled webhooks update the local DB.
   *
   * For MANUAL: creates an `OrderFulfillment` row, flips the chosen line items'
   * `fulfillmentStatus` to "fulfilled", and recomputes the order-level status.
   */
  async createFulfillment(
    orderId: string,
    orgId: string,
    userId: string,
    dto: CreateFulfillmentDto,
  ) {
    const order = await this.loadOrderWithChannel(orderId, orgId);

    if (order.channel.platform === ChannelPlatform.SHOPIFY) {
      const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(order.channel.id);
      const auth = { shopDomain, accessToken: token };
      const orderGid = ShopifyGraphqlClient.toGid('Order', order.externalId);

      const foResp = await this.graphql.request<
        OrderFulfillmentOrdersResponse,
        { id: string }
      >(auth, ORDER_FULFILLMENT_ORDERS_QUERY, { id: orderGid });
      const fos = foResp.order?.fulfillmentOrders.nodes ?? [];

      // Group the requested line items by which FulfillmentOrder owns them.
      // If a single OrderLineItem spans multiple FOs (multi-location), we
      // greedily take from the first match — multi-location partial
      // fulfillment is Phase 2b. The remainingQuantity ceiling protects
      // against over-fulfilling.
      const requestedByLineItem = new Map(
        dto.lineItems.map((li) => [li.lineItemId, li]),
      );
      const grouped = new Map<string, Array<{ id: string; quantity: number }>>();
      for (const fo of fos) {
        for (const foli of fo.lineItems.nodes) {
          const orderLineItemId = ShopifyGraphqlClient.extractId(foli.lineItem.id);
          const req = requestedByLineItem.get(orderLineItemId);
          if (!req) continue;
          const qty =
            req.quantity !== undefined
              ? Math.min(req.quantity, foli.remainingQuantity)
              : foli.remainingQuantity;
          if (qty <= 0) continue;
          const list = grouped.get(fo.id) ?? [];
          list.push({ id: foli.id, quantity: qty });
          grouped.set(fo.id, list);
          requestedByLineItem.delete(orderLineItemId);
        }
      }
      if (grouped.size === 0) {
        throw new BadRequestException(
          'None of the requested line items are currently fulfillable.',
        );
      }

      const lineItemsByFulfillmentOrder = Array.from(grouped.entries()).map(
        ([fulfillmentOrderId, fulfillmentOrderLineItems]) => ({
          fulfillmentOrderId,
          fulfillmentOrderLineItems,
        }),
      );

      const result = await this.graphql.request<
        FulfillmentCreateResponse,
        FulfillmentCreateVariables
      >(auth, FULFILLMENT_CREATE_MUTATION, {
        fulfillment: {
          lineItemsByFulfillmentOrder,
          notifyCustomer: dto.notifyCustomer ?? true,
          trackingInfo: dto.tracking
            ? {
                number: dto.tracking.number ?? null,
                url: dto.tracking.url ?? null,
                company: dto.tracking.company ?? null,
              }
            : null,
        },
      });
      ShopifyGraphqlClient.throwIfUserErrors(
        result.fulfillmentCreate.userErrors,
        'fulfillmentCreate',
      );

      // Local OrderFulfillment row is created when fulfillments/create
      // webhook fires (via upsertOrder), so just record the action in our
      // timeline here for immediate UI feedback.
      await this.prisma.orderTimelineEvent.create({
        data: {
          orderId,
          actorId: userId,
          action: 'fulfilled',
          message: dto.tracking?.number
            ? `Fulfillment initiated (tracking ${dto.tracking.number}${
                dto.tracking.company ? ` via ${dto.tracking.company}` : ''
              })`
            : 'Fulfillment initiated',
          metadata: {
            shopifyFulfillmentId: result.fulfillmentCreate.fulfillment?.id ?? null,
            tracking: dto.tracking ?? null,
            notifyCustomer: dto.notifyCustomer ?? true,
          } as Prisma.InputJsonValue,
        },
      });
      return this.prisma.order.findUnique({ where: { id: orderId } });
    }

    // ── Manual branch ──────────────────────────────────────────────────────
    return this.prisma.$transaction(async (tx) => {
      const requestedIds = dto.lineItems.map((li) => li.lineItemId);
      const lineItems = await tx.orderLineItem.findMany({
        where: { orderId, id: { in: requestedIds } },
      });
      if (lineItems.length !== requestedIds.length) {
        throw new BadRequestException(
          'One or more line items were not found on this order.',
        );
      }

      const fulfillment = await tx.orderFulfillment.create({
        data: {
          orderId,
          externalId: `manual_${randomUUID()}`,
          status: 'fulfilled',
          trackingNumber: dto.tracking?.number ?? null,
          trackingUrl: dto.tracking?.url ?? null,
          trackingCompany: dto.tracking?.company ?? null,
          shippedAt: new Date(),
          metadata: {
            lineItemIds: lineItems.map((li) => li.id),
          } as Prisma.InputJsonValue,
        },
      });

      await tx.orderLineItem.updateMany({
        where: { id: { in: lineItems.map((li) => li.id) } },
        data: { fulfillmentStatus: 'fulfilled' },
      });

      const allItems = await tx.orderLineItem.findMany({ where: { orderId } });
      const newStatus = this.computeFulfillmentStatus(allItems);
      await tx.order.update({
        where: { id: orderId },
        data: { fulfillmentStatus: newStatus },
      });

      await tx.orderTimelineEvent.create({
        data: {
          orderId,
          actorId: userId,
          action: 'fulfilled',
          message: `Fulfillment recorded (${lineItems.length} item${lineItems.length === 1 ? '' : 's'}${
            dto.tracking?.number ? `, tracking ${dto.tracking.number}` : ''
          })`,
          metadata: {
            fulfillmentId: fulfillment.id,
            tracking: dto.tracking ?? null,
            lineItemIds: lineItems.map((li) => li.id),
          } as Prisma.InputJsonValue,
        },
      });

      return fulfillment;
    });
  }

  /** Update tracking number/URL/carrier on an existing fulfillment. */
  async updateTracking(
    orderId: string,
    fulfillmentId: string,
    orgId: string,
    userId: string,
    dto: UpdateTrackingDto,
  ) {
    const order = await this.loadOrderWithChannel(orderId, orgId);
    const fulfillment = await this.prisma.orderFulfillment.findFirst({
      where: { id: fulfillmentId, orderId },
    });
    if (!fulfillment) throw new NotFoundException('Fulfillment not found');

    const isShopifyFulfillment =
      order.channel.platform === ChannelPlatform.SHOPIFY &&
      !!fulfillment.externalId &&
      !fulfillment.externalId.startsWith('manual_');

    if (isShopifyFulfillment) {
      const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(order.channel.id);
      const result = await this.graphql.request<
        FulfillmentTrackingInfoUpdateResponse,
        FulfillmentTrackingInfoUpdateVariables
      >(
        { shopDomain, accessToken: token },
        FULFILLMENT_TRACKING_INFO_UPDATE_MUTATION,
        {
          fulfillmentId: ShopifyGraphqlClient.toGid('Fulfillment', fulfillment.externalId!),
          trackingInfoInput: {
            number: dto.tracking.number ?? null,
            url: dto.tracking.url ?? null,
            company: dto.tracking.company ?? null,
          },
          notifyCustomer: dto.notifyCustomer ?? true,
        },
      );
      ShopifyGraphqlClient.throwIfUserErrors(
        result.fulfillmentTrackingInfoUpdate.userErrors,
        'fulfillmentTrackingInfoUpdate',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.orderFulfillment.update({
        where: { id: fulfillmentId },
        data: {
          trackingNumber: dto.tracking.number ?? null,
          trackingUrl: dto.tracking.url ?? null,
          trackingCompany: dto.tracking.company ?? null,
        },
      });
      await tx.orderTimelineEvent.create({
        data: {
          orderId,
          actorId: userId,
          action: 'tracking_updated',
          message: `Tracking updated${
            dto.tracking.number ? `: ${dto.tracking.number}` : ''
          }${dto.tracking.company ? ` (${dto.tracking.company})` : ''}`,
          metadata: {
            fulfillmentId,
            tracking: { ...dto.tracking },
          } as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
  }

  /**
   * Cancel a fulfillment. SHOPIFY fulfillments round-trip via
   * `fulfillmentCancel`. MANUAL fulfillments reverse the local state:
   * line items un-fulfilled, order status recomputed.
   */
  async cancelFulfillment(
    orderId: string,
    fulfillmentId: string,
    orgId: string,
    userId: string,
  ) {
    const order = await this.loadOrderWithChannel(orderId, orgId);
    const fulfillment = await this.prisma.orderFulfillment.findFirst({
      where: { id: fulfillmentId, orderId },
    });
    if (!fulfillment) throw new NotFoundException('Fulfillment not found');
    if (fulfillment.status === 'cancelled') {
      throw new BadRequestException('Fulfillment is already cancelled');
    }

    const isShopifyFulfillment =
      order.channel.platform === ChannelPlatform.SHOPIFY &&
      !!fulfillment.externalId &&
      !fulfillment.externalId.startsWith('manual_');

    if (isShopifyFulfillment) {
      const { token, shopDomain } = await this.shopifyOAuth.getAccessToken(order.channel.id);
      const result = await this.graphql.request<
        FulfillmentCancelResponse,
        FulfillmentCancelVariables
      >(
        { shopDomain, accessToken: token },
        FULFILLMENT_CANCEL_MUTATION,
        { id: ShopifyGraphqlClient.toGid('Fulfillment', fulfillment.externalId!) },
      );
      ShopifyGraphqlClient.throwIfUserErrors(
        result.fulfillmentCancel.userErrors,
        'fulfillmentCancel',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.orderFulfillment.update({
        where: { id: fulfillmentId },
        data: { status: 'cancelled' },
      });

      // For manual fulfillments, reverse the line-item status flips done at
      // create-time. For Shopify, the webhook will reconcile.
      if (!isShopifyFulfillment) {
        const meta = (fulfillment.metadata ?? {}) as Record<string, unknown>;
        const lineItemIds = Array.isArray(meta.lineItemIds)
          ? (meta.lineItemIds as string[])
          : [];
        if (lineItemIds.length > 0) {
          await tx.orderLineItem.updateMany({
            where: { id: { in: lineItemIds } },
            data: { fulfillmentStatus: null },
          });
        }
        const allItems = await tx.orderLineItem.findMany({ where: { orderId } });
        const newStatus = this.computeFulfillmentStatus(allItems);
        await tx.order.update({
          where: { id: orderId },
          data: { fulfillmentStatus: newStatus },
        });
      }

      await tx.orderTimelineEvent.create({
        data: {
          orderId,
          actorId: userId,
          action: 'fulfillment_cancelled',
          message: 'Fulfillment cancelled',
          metadata: { fulfillmentId } as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
  }

  /** Compute order-level fulfillment status from the per-line-item state. */
  private computeFulfillmentStatus(
    items: { fulfillmentStatus: string | null }[],
  ): OrderFulfillmentStatus {
    const fulfilled = items.filter((li) => li.fulfillmentStatus === 'fulfilled').length;
    if (fulfilled === 0) return OrderFulfillmentStatus.UNFULFILLED;
    if (fulfilled === items.length) return OrderFulfillmentStatus.FULFILLED;
    return OrderFulfillmentStatus.PARTIAL;
  }

  // ─── PHASE 1 HELPERS ──────────────────────────────────────────────────────

  private async loadOrderWithChannel(id: string, orgId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: { channel: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /**
   * Map an arbitrary address object (accepts both REST snake_case and the
   * camelCase shape Shopify GraphQL expects) into a MailingAddressInput.
   * Unknown fields fall through; the merchant DB stores addresses as raw
   * JSON so we tolerate variation.
   */
  private toShopifyAddress(addr: Record<string, unknown>): MailingAddressInput {
    const pick = (...keys: string[]): string | null => {
      for (const k of keys) {
        const v = addr[k];
        if (typeof v === 'string') return v;
      }
      return null;
    };
    return {
      address1: pick('address1'),
      address2: pick('address2'),
      city: pick('city'),
      province: pick('province'),
      country: pick('country'),
      countryCode: pick('countryCode', 'country_code'),
      zip: pick('zip'),
      firstName: pick('firstName', 'first_name'),
      lastName: pick('lastName', 'last_name'),
      phone: pick('phone'),
      company: pick('company'),
    };
  }
}