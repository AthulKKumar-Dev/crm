import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AllowVendor } from '../auth/decorators/allow-vendor.decorator';
import {
  ORG_MANAGERS,
  ORG_OPERATORS,
  ORG_OPERATORS_AND_VENDORS,
  Roles,
} from '../auth/decorators/roles.decorator';
import { vendorScopeFor } from '../auth/vendor-scope.util';
import { OrderService } from './order.service';
import { QueryDashboardDto } from '../dashboard/dto/query-dashboard.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { CreateOfflineOrderDto } from './dto/create-offline-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CapturePaymentDto } from './dto/capture-payment.dto';
import { CreateFulfillmentDto } from './dto/create-fulfillment.dto';
import { UpdateTrackingDto } from './dto/update-tracking.dto';
import { SetItemsStatusDto } from './dto/mark-in-progress.dto';
import type { Response } from 'express';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) { }

  // GET /api/v1/orders?page=1&limit=20&financialStatus=PAID&search=1001
  @Get()
  @AllowVendor()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: QueryOrdersDto) {
    return this.orderService.findAll(user.orgId!, query, vendorScopeFor(user));
  }

  // POST /api/v1/orders/offline — create an offline (in-store) order with
  // optional auto-invoice and inventory decrement.
  @Post('offline')
  @Roles(...ORG_OPERATORS)
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
  @AllowVendor()
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const scope = vendorScopeFor(user);
    return scope
      ? this.orderService.findOneForVendor(id, user.orgId!, scope)
      : this.orderService.findOne(id, user.orgId!);
  }

  // PATCH /api/v1/orders/:id — edit tags / note / email / phone /
  // shipping address / customAttributes. For SHOPIFY orders this fires the
  // `orderUpdate` mutation; for MANUAL orders it just touches the local row.
  @Patch(':id')
  @Roles(...ORG_OPERATORS)
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.orderService.update(id, user.orgId!, user.sub, dto);
  }

  // POST /api/v1/orders/:id/cancel — cancel an order with optional refund + restock.
  // Manager+: reverses inventory and the customer's lifetime value.
  @Post(':id/cancel')
  @Roles(...ORG_MANAGERS)
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orderService.cancel(id, user.orgId!, user.sub, dto);
  }

  // POST /api/v1/orders/:id/close — archive a completed order.
  // Reversible via open(), so operators may do it.
  @Post(':id/close')
  @Roles(...ORG_OPERATORS)
  close(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orderService.close(id, user.orgId!, user.sub);
  }

  // POST /api/v1/orders/:id/open — un-archive a previously closed order.
  @Post(':id/open')
  @Roles(...ORG_OPERATORS)
  open(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orderService.open(id, user.orgId!, user.sub);
  }

  // POST /api/v1/orders/:id/mark-paid — flip financial status to PAID.
  // Manager+: asserts money was received.
  @Post(':id/mark-paid')
  @Roles(...ORG_MANAGERS)
  markPaid(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orderService.markPaid(id, user.orgId!, user.sub);
  }

  // POST /api/v1/orders/:id/capture — capture an authorized Shopify payment.
  // Manager+: moves real money.
  @Post(':id/capture')
  @Roles(...ORG_MANAGERS)
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
  // GET /api/v1/orders/:id/adjacent
  // The ids either side of this order, plus its position, for the detail
  // page's Previous / Next rail.
  @Get(':id/adjacent')
  @AllowVendor()
  adjacent(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orderService.findAdjacent(id, user.orgId!, vendorScopeFor(user));
  }

  // Reads what is left to ship, and only the fulfilment UI consumes it. The
  // RolesGuard is allow-by-default, so without a decorator this was open to
  // every member including VIEWER — match the endpoint it feeds.
  @Get(':id/fulfillable-line-items')
  @Roles(...ORG_OPERATORS_AND_VENDORS)
  fulfillableLineItems(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orderService.listFulfillableLineItems(id, user.orgId!);
  }

  // POST /api/v1/orders/:id/fulfillments
  // Create a fulfillment with optional tracking info.
  @Post(':id/fulfillments')
  @AllowVendor()
  @Roles(...ORG_OPERATORS_AND_VENDORS)
  createFulfillment(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateFulfillmentDto,
  ) {
    return this.orderService.createFulfillment(id, user.orgId!, user.sub, dto, vendorScopeFor(user));
  }

  // POST /api/v1/orders/:id/items/status — vendor sets their items to in_progress / on_hold.
  @Post(':id/items/status')
  @AllowVendor()
  @Roles(...ORG_OPERATORS_AND_VENDORS)
  setItemsStatus(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SetItemsStatusDto,
  ) {
    return this.orderService.setVendorItemsStatus(
      id,
      user.orgId!,
      user.sub,
      dto.status,
      dto.lineItemIds,
      vendorScopeFor(user),
      dto.reason,
    );
  }

  // POST /api/v1/orders/:id/items/:lineId/delivered — vendor marks ONE product delivered.
  @Post(':id/items/:lineId/delivered')
  @AllowVendor()
  @Roles(...ORG_OPERATORS_AND_VENDORS)
  markItemDelivered(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orderService.markVendorItemDelivered(
      id,
      user.orgId!,
      user.sub,
      lineId,
      vendorScopeFor(user),
    );
  }

  // POST /api/v1/orders/:id/items/:lineId/unfulfill — vendor switches ONE product back to unfulfilled.
  @Post(':id/items/:lineId/unfulfill')
  @AllowVendor()
  @Roles(...ORG_OPERATORS_AND_VENDORS)
  unfulfillItem(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orderService.unfulfillVendorItem(
      id,
      user.orgId!,
      user.sub,
      lineId,
      vendorScopeFor(user),
    );
  }

  // PATCH /api/v1/orders/:id/items/:lineId/tracking — add/update tracking for ONE product.
  @Patch(':id/items/:lineId/tracking')
  @AllowVendor()
  @Roles(...ORG_OPERATORS_AND_VENDORS)
  updateItemTracking(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTrackingDto,
  ) {
    return this.orderService.updateItemTracking(
      id,
      user.orgId!,
      user.sub,
      lineId,
      dto,
      vendorScopeFor(user),
    );
  }

  // PATCH /api/v1/orders/:id/fulfillments/:fid/tracking
  @Patch(':id/fulfillments/:fid/tracking')
  @AllowVendor()
  @Roles(...ORG_OPERATORS_AND_VENDORS)
  updateTracking(
    @Param('id') id: string,
    @Param('fid') fid: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTrackingDto,
  ) {
    return this.orderService.updateTracking(id, fid, user.orgId!, user.sub, dto, vendorScopeFor(user));
  }

  // POST /api/v1/orders/:id/fulfillments/:fid/delivered — mark a shipment delivered.
  @Post(':id/fulfillments/:fid/delivered')
  @AllowVendor()
  @Roles(...ORG_OPERATORS_AND_VENDORS)
  markFulfillmentDelivered(
    @Param('id') id: string,
    @Param('fid') fid: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orderService.markFulfillmentDelivered(
      id,
      user.orgId!,
      user.sub,
      fid,
      vendorScopeFor(user),
    );
  }

  // POST /api/v1/orders/:id/fulfillments/:fid/cancel — also the vendor's
  // "switch back to unfulfilled" action (scoped to their own fulfilments).
  @Post(':id/fulfillments/:fid/cancel')
  @AllowVendor()
  @Roles(...ORG_OPERATORS_AND_VENDORS)
  cancelFulfillment(
    @Param('id') id: string,
    @Param('fid') fid: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orderService.cancelFulfillment(id, fid, user.orgId!, user.sub, vendorScopeFor(user));
  }

  // POST /api/v1/orders/:id/sync — manually push a MANUAL offline order to the
  // connected Shopify store. Idempotent; returns { status, orderId } where
  // status is one of: ALREADY_SYNCED | ALREADY_QUEUED | QUEUED.
  @Post(':id/sync')
  @Roles(...ORG_OPERATORS)
  syncToShopify(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orderService.syncToShopify(id, user.orgId!, user.sub);
  }
}