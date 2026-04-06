import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { QueryDashboardDto } from '../dashboard/dto/query-dashboard.dto';
import { Parser } from 'json2csv';

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) { }

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
}