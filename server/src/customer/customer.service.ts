import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) { }

  async findAll(orgId: string, query: QueryCustomersDto) {
    const where: Prisma.CustomerWhereInput = { organizationId: orgId, deletedAt: null };
    if (query.vipLevel) where.vipLevel = query.vipLevel;
    if (query.channelId) where.channelId = query.channelId;
    if (query.tag) where.tags = { has: query.tag };
    if (query.segment) where.segments = { has: query.segment };
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        include: {
          channel: { select: { id: true, name: true, platform: true } },
          _count: { select: { orders: true } },
        },
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: data.map((c) => ({
        id: c.id, firstName: c.firstName, lastName: c.lastName,
        email: c.email, phone: c.phone, vipLevel: c.vipLevel,
        totalSpent: c.totalSpent, ordersCount: c.ordersCount,
        tags: c.tags, segments: c.segments, state: c.state,
        channel: c.channel, orderCount: c._count.orders,
        createdAt: c.externalCreatedAt || c.createdAt,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, orgId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        channel: { select: { id: true, name: true, platform: true } },
        orders: {
          orderBy: { externalCreatedAt: 'desc' }, take: 10,
          select: {
            id: true, orderNumber: true, name: true, totalPrice: true,
            financialStatus: true, fulfillmentStatus: true, currency: true, externalCreatedAt: true
          },
        },
        activityLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async update(id: string, orgId: string, userId: string, dto: UpdateCustomerDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    if (dto.vipLevel && dto.vipLevel !== customer.vipLevel) {
      await this.prisma.customerActivityLog.create({
        data: {
          customerId: id, actorId: userId, action: 'vip_changed',
          description: `VIP level changed from ${customer.vipLevel} to ${dto.vipLevel}`,
          oldValue: customer.vipLevel, newValue: dto.vipLevel,
        },
      });
    }

    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  async getTags(orgId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { organizationId: orgId, deletedAt: null }, select: { tags: true },
    });
    const allTags = new Set<string>();
    customers.forEach((c) => c.tags.forEach((t) => allTags.add(t)));
    return [...allTags].sort();
  }

  async getSegments(orgId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { organizationId: orgId, deletedAt: null }, select: { segments: true },
    });
    const allSegments = new Set<string>();
    customers.forEach((c) => c.segments.forEach((s) => allSegments.add(s)));
    return [...allSegments].sort();
  }
}