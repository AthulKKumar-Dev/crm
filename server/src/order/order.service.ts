import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryOrdersDto } from './dto/query-orders.dto';

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
}