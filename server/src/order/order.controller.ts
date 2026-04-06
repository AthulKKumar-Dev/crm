import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrderService } from './order.service';
import { QueryDashboardDto } from '../dashboard/dto/query-dashboard.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import type { Response } from 'express';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) { }

  // GET /api/v1/orders?page=1&limit=20&financialStatus=PAID&search=1001
  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: QueryOrdersDto) {
    return this.orderService.findAll(user.orgId!, query);
  }

  // GET /api/v1/orders/stats — MUST be before :id route
  @Get('stats')
  getStats(@CurrentUser() user: JwtPayload, @Query() query: QueryDashboardDto) {
    return this.orderService.getComparison(user.orgId!, query);
  }

  // GET /api/v1/orders/export/csv
  @Get('export/csv')
  async exportCsv(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryOrdersDto,
    @Res() res: Response,
  ) {
    const data = await this.orderService.getExportData(user.orgId!, query);
    const csv = this.orderService.generateCsv(data);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=orders-export.csv');
    res.send(csv);
  }

  // GET /api/v1/orders/export/json
  @Get('export/json')
  async exportJson(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryOrdersDto,
    @Res() res: Response,
  ) {
    const data = await this.orderService.getExportData(user.orgId!, query);
    const report = {
      generatedAt: new Date().toISOString(),
      filters: {
        financialStatus: query.financialStatus || 'all',
        fulfillmentStatus: query.fulfillmentStatus || 'all',
        dateFrom: query.dateFrom || 'all',
        dateTo: query.dateTo || 'all',
      },
      totalOrders: data.length,
      orders: data,
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=orders-report.json');
    res.send(JSON.stringify(report, null, 2));
  }

  // GET /api/v1/orders/:id
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orderService.findOne(id, user.orgId!);
  }
}