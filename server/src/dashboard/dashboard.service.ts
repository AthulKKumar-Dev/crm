import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { Prisma } from '@prisma/client';
import { Parser } from 'json2csv';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) { }

  async getOverview(orgId: string, query: QueryDashboardDto) {
    // Build date filter for orders
    const dateFilter: Prisma.OrderWhereInput = {};
    if (query.dateFrom || query.dateTo) {
      dateFilter.externalCreatedAt = {};
      if (query.dateFrom) dateFilter.externalCreatedAt.gte = new Date(query.dateFrom);
      if (query.dateTo) dateFilter.externalCreatedAt.lte = new Date(query.dateTo);
    }

    const baseOrderWhere: Prisma.OrderWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      ...(query.channelId && { channelId: query.channelId }),
      ...dateFilter,
    };

    const baseProductWhere: Prisma.ProductWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      ...(query.channelId && { channelId: query.channelId }),
    };

    // Run all queries in parallel for speed
    const [
      totalSales,
      totalOrders,
      ordersByStatus,
      totalProducts,
      totalInventory,
      topSellingProducts,
      recentOrders,
      totalCustomers,
    ] = await Promise.all([
      // 1. Total sales (sum of totalPrice for paid orders)
      this.prisma.order.aggregate({
        where: {
          ...baseOrderWhere,
          financialStatus: { in: ['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'] },
        },
        _sum: { totalPrice: true },
      }),

      // 2. Total orders count
      this.prisma.order.count({ where: baseOrderWhere }),

      // 3. Orders grouped by fulfillment status
      this.prisma.order.groupBy({
        by: ['fulfillmentStatus'],
        where: baseOrderWhere,
        _count: true,
      }),

      // 4. Total active products count
      this.prisma.product.count({
        where: { ...baseProductWhere, status: 'ACTIVE' },
      }),

      // 5. Total inventory (sum of all variant stock)
      this.prisma.productVariant.aggregate({
        where: {
          product: baseProductWhere,
        },
        _sum: { inventoryQuantity: true },
      }),

      // 6. Top 5 selling products (by total quantity sold)
      this.getTopSellingProducts(orgId, query, 5),

      // 7. Recent 5 orders
      this.prisma.order.findMany({
        where: baseOrderWhere,
        include: {
          customer: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          _count: { select: { lineItems: true } },
        },
        orderBy: { externalCreatedAt: 'desc' },
        take: 5,
      }),

      // 8. Total customers count
      this.prisma.customer.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          ...(query.channelId && { channelId: query.channelId }),
        },
      }),
    ]);

    // Format fulfillment status breakdown
    const fulfillmentBreakdown: Record<string, number> = {};
    for (const group of ordersByStatus) {
      fulfillmentBreakdown[group.fulfillmentStatus] = group._count;
    }

    return {
      // Sales overview
      totalSales: totalSales._sum.totalPrice ?? 0,
      totalOrders,
      totalCustomers,

      // Product overview
      totalProducts,
      totalInventory: totalInventory._sum.inventoryQuantity ?? 0,

      // Order status breakdown
      fulfillmentBreakdown: {
        unfulfilled: fulfillmentBreakdown['UNFULFILLED'] ?? 0,
        fulfilled: fulfillmentBreakdown['FULFILLED'] ?? 0,
        partial: fulfillmentBreakdown['PARTIAL'] ?? 0,
        restocked: fulfillmentBreakdown['RESTOCKED'] ?? 0,
      },

      // Top 5 selling products
      topSellingProducts,

      // Recent 5 orders
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        name: order.name,
        totalPrice: order.totalPrice,
        currency: order.currency,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        customer: order.customer,
        itemCount: order._count.lineItems,
        createdAt: order.externalCreatedAt || order.createdAt,
      })),
    };
  }



  async getReportData(orgId: string, query: QueryDashboardDto) {
    const baseWhere: Prisma.OrderWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      ...(query.channelId && { channelId: query.channelId }),
      ...(query.dateFrom || query.dateTo ? {
        externalCreatedAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      } : {}),
    };

    const orders = await this.prisma.order.findMany({
      where: baseWhere,
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
      date: o.externalCreatedAt?.toISOString() || o.createdAt.toISOString(),
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

  // ─── MONTHLY REVENUE & PROFIT (for bar chart) ───
  async getMonthlySales(orgId: string, query: QueryDashboardDto) {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const orders = await this.prisma.order.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        financialStatus: { in: ['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'] },
        externalCreatedAt: { gte: twelveMonthsAgo },
        ...(query.channelId && { channelId: query.channelId }),
      },
      select: {
        totalPrice: true,
        totalDiscounts: true,
        totalShippingPrice: true,
        externalCreatedAt: true,
        createdAt: true,
      },
    });

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthMap = new Map<string, { revenue: number; profit: number }>();

    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      monthMap.set(monthNames[d.getMonth()], { revenue: 0, profit: 0 });
    }

    for (const order of orders) {
      const date = order.externalCreatedAt || order.createdAt;
      const key = monthNames[date.getMonth()];
      const existing = monthMap.get(key);
      if (existing) {
        const revenue = parseFloat(order.totalPrice.toString());
        const costs = parseFloat(order.totalShippingPrice.toString()) + parseFloat(order.totalDiscounts.toString());
        existing.revenue += revenue;
        existing.profit += revenue - costs;
      }
    }

    const data = Array.from(monthMap.entries()).map(([month, values]) => ({
      month,
      revenue: Math.round(values.revenue * 100) / 100,
      profit: Math.round(values.profit * 100) / 100,
    }));

    const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
    const totalProfit = data.reduce((s, d) => s + d.profit, 0);

    return { data, totalRevenue: Math.round(totalRevenue * 100) / 100, totalProfit: Math.round(totalProfit * 100) / 100 };
  }

  // ─── SALES BY PRODUCT TYPE (for donut chart) ───
  async getSalesByCategory(orgId: string, query: QueryDashboardDto) {
    const dateFilter: Prisma.OrderWhereInput = {};
    if (query.dateFrom || query.dateTo) {
      dateFilter.externalCreatedAt = {
        ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
        ...(query.dateTo && { lte: new Date(query.dateTo) }),
      };
    }

    const lineItems = await this.prisma.orderLineItem.findMany({
      where: {
        order: {
          organizationId: orgId,
          deletedAt: null,
          financialStatus: { in: ['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'] },
          ...dateFilter,
          ...(query.channelId && { channelId: query.channelId }),
        },
      },
      select: {
        price: true,
        quantity: true,
        totalDiscount: true,
        variant: { select: { product: { select: { productType: true } } } },
      },
    });

    const categoryMap = new Map<string, number>();
    for (const item of lineItems) {
      const category = item.variant?.product?.productType || 'Other';
      const amount = parseFloat(item.price.toString()) * item.quantity - parseFloat(item.totalDiscount.toString());
      categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
    }

    const sorted = Array.from(categoryMap.entries()).sort(([, a], [, b]) => b - a);
    const COLORS = ['#a78bfa', '#fbbf24', '#fb923c', '#818cf8', '#34d399', '#f472b6', '#60a5fa', '#f87171'];

    const data = sorted.slice(0, 6).map(([name, value], i) => ({
      name,
      value: Math.round(value * 100) / 100,
      color: COLORS[i % COLORS.length],
    }));

    const otherTotal = sorted.slice(6).reduce((s, [, v]) => s + v, 0);
    if (otherTotal > 0) {
      data.push({ name: 'Other', value: Math.round(otherTotal * 100) / 100, color: '#9ca3af' });
    }

    return { data, total: Math.round(data.reduce((s, d) => s + d.value, 0) * 100) / 100 };
  }

  private async getTopSellingProducts(orgId: string, query: QueryDashboardDto, limit: number) {
    // Group line items by externalProductId to get total quantity sold per product
    const dateFilter: any = {};
    if (query.dateFrom || query.dateTo) {
      dateFilter.order = {
        externalCreatedAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      };
    }

    const topItems = await this.prisma.orderLineItem.groupBy({
      by: ['externalProductId'],
      where: {
        order: {
          organizationId: orgId,
          deletedAt: null,
          ...(query.channelId && { channelId: query.channelId }),
          ...(query.dateFrom || query.dateTo ? {
            externalCreatedAt: {
              ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
              ...(query.dateTo && { lte: new Date(query.dateTo) }),
            },
          } : {}),
        },
        externalProductId: { not: null },
      },
      _sum: { quantity: true },
      _count: true,
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });

    // Fetch product details for the top items
    const productIds = topItems
      .map((item) => item.externalProductId)
      .filter(Boolean) as string[];

    const products = await this.prisma.product.findMany({
      where: {
        organizationId: orgId,
        externalId: { in: productIds },
      },
      include: {
        images: { take: 1, orderBy: { position: 'asc' } },
        variants: { select: { price: true, inventoryQuantity: true } },
      },
    });

    const productMap = new Map(products.map((p) => [p.externalId, p]));

    return topItems.map((item) => {
      const product = productMap.get(item.externalProductId!);
      const totalStock = product?.variants.reduce((sum, v) => sum + v.inventoryQuantity, 0) ?? 0;
      const prices = product?.variants.map((v) => parseFloat(String(v.price))) ?? [];

      return {
        externalProductId: item.externalProductId,
        title: product?.title ?? 'Unknown Product',
        image: product?.images[0]?.src ?? null,
        totalQuantitySold: item._sum.quantity ?? 0,
        totalOrders: item._count,
        currentStock: totalStock,
        price: prices.length > 0 ? Math.min(...prices).toFixed(2) : '0.00',
      };
    });
  }
}

