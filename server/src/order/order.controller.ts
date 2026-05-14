import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrderService } from './order.service';
import { QueryDashboardDto } from '../dashboard/dto/query-dashboard.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { CreateOfflineOrderDto } from './dto/create-offline-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CapturePaymentDto } from './dto/capture-payment.dto';
import { CreateFulfillmentDto } from './dto/create-fulfillment.dto';
import { UpdateTrackingDto } from './dto/update-tracking.dto';
import type { Response } from 'express';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) { }

  // GET /api/v1/orders?page=1&limit=20&financialStatus=PAID&search=1001
  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: QueryOrdersDto) {
    return this.orderService.findAll(user.orgId!, query);
  }

  // POST /api/v1/orders/offline — create an offline (in-store) order with
  // optional auto-invoice and inventory decrement.
  @Post('offline')
  createOffline(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOfflineOrderDto,
  ) {
    return this.orderService.createOfflineOrder(user.orgId!, user.sub, dto);
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

  // PATCH /api/v1/orders/:id — edit tags / note / email / phone /
  // shipping address / customAttributes. For SHOPIFY orders this fires the
  // `orderUpdate` mutation; for MANUAL orders it just touches the local row.
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.orderService.update(id, user.orgId!, user.sub, dto);
  }

  // POST /api/v1/orders/:id/cancel — cancel an order with optional refund + restock.
  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orderService.cancel(id, user.orgId!, user.sub, dto);
  }

  // POST /api/v1/orders/:id/close — archive a completed order.
  @Post(':id/close')
  close(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orderService.close(id, user.orgId!, user.sub);
  }

  // POST /api/v1/orders/:id/open — un-archive a previously closed order.
  @Post(':id/open')
  open(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orderService.open(id, user.orgId!, user.sub);
  }

  // POST /api/v1/orders/:id/mark-paid — flip financial status to PAID.
  @Post(':id/mark-paid')
  markPaid(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orderService.markPaid(id, user.orgId!, user.sub);
  }

  // POST /api/v1/orders/:id/capture — capture an authorized Shopify payment.
  @Post(':id/capture')
  capture(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CapturePaymentDto,
  ) {
    return this.orderService.capture(id, user.orgId!, user.sub, dto);
  }

  // ─── PHASE 2: FULFILLMENT & TRACKING ────────────────────────────────────

  // GET /api/v1/orders/:id/fulfillable-line-items
  // Returns the line items still eligible for fulfillment, grouped by
  // FulfillmentOrder (Shopify) or as a single bucket (manual orders).
  @Get(':id/fulfillable-line-items')
  fulfillableLineItems(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orderService.listFulfillableLineItems(id, user.orgId!);
  }

  // POST /api/v1/orders/:id/fulfillments
  // Create a fulfillment with optional tracking info.
  @Post(':id/fulfillments')
  createFulfillment(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateFulfillmentDto,
  ) {
    return this.orderService.createFulfillment(id, user.orgId!, user.sub, dto);
  }

  // PATCH /api/v1/orders/:id/fulfillments/:fid/tracking
  @Patch(':id/fulfillments/:fid/tracking')
  updateTracking(
    @Param('id') id: string,
    @Param('fid') fid: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTrackingDto,
  ) {
    return this.orderService.updateTracking(id, fid, user.orgId!, user.sub, dto);
  }

  // POST /api/v1/orders/:id/fulfillments/:fid/cancel
  @Post(':id/fulfillments/:fid/cancel')
  cancelFulfillment(
    @Param('id') id: string,
    @Param('fid') fid: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orderService.cancelFulfillment(id, fid, user.orgId!, user.sub);
  }

  // POST /api/v1/orders/:id/sync — manually push a MANUAL offline order to the
  // connected Shopify store. Idempotent; returns { status, orderId } where
  // status is one of: ALREADY_SYNCED | ALREADY_QUEUED | QUEUED.
  @Post(':id/sync')
  syncToShopify(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orderService.syncToShopify(id, user.orgId!);
  }
}