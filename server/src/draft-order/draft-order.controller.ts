import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DraftOrderService } from './draft-order.service';
import { CreateDraftOrderDto } from './dto/create-draft-order.dto';
import { UpdateDraftOrderDto } from './dto/update-draft-order.dto';
import { CompleteDraftDto } from './dto/complete-draft.dto';
import { SendDraftInvoiceDto } from './dto/send-invoice.dto';
import { QueryDraftOrdersDto } from './dto/query-drafts.dto';
import { QueryDraftStatsDto } from './dto/query-draft-stats.dto';
import { ORG_OPERATORS, Roles } from '../auth/decorators/roles.decorator';

@Controller('draft-orders')
export class DraftOrderController {
  constructor(private readonly service: DraftOrderService) {}

  // GET /api/v1/draft-orders
  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: QueryDraftOrdersDto) {
    return this.service.findAll(user.orgId!, query);
  }

  // GET /api/v1/draft-orders/stats — KPI aggregates and filter-chip counts.
  // MUST stay above `@Get(':id')`: Nest matches in declaration order, so with
  // the routes the other way round "stats" is read as a draft id.
  @Get('stats')
  getStats(@CurrentUser() user: JwtPayload, @Query() query: QueryDraftStatsDto) {
    return this.service.getStats(user.orgId!, query);
  }

  // POST /api/v1/draft-orders
  @Post()
  @Roles(...ORG_OPERATORS)
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDraftOrderDto,
  ) {
    return this.service.create(user.orgId!, user.sub, dto);
  }

  // GET /api/v1/draft-orders/:id
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user.orgId!);
  }

  // PATCH /api/v1/draft-orders/:id
  @Patch(':id')
  @Roles(...ORG_OPERATORS)
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateDraftOrderDto,
  ) {
    return this.service.update(id, user.orgId!, user.sub, dto);
  }

  // DELETE /api/v1/draft-orders/:id
  @Delete(':id')
  @Roles(...ORG_OPERATORS)
  softDelete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.softDelete(id, user.orgId!);
  }

  // POST /api/v1/draft-orders/:id/complete — convert to a real Order.
  @Post(':id/complete')
  @Roles(...ORG_OPERATORS)
  complete(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CompleteDraftDto,
  ) {
    return this.service.complete(id, user.orgId!, user.sub, dto);
  }

  // POST /api/v1/draft-orders/:id/send-invoice — SHOPIFY-only.
  @Post(':id/send-invoice')
  @Roles(...ORG_OPERATORS)
  sendInvoice(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendDraftInvoiceDto,
  ) {
    return this.service.sendInvoice(id, user.orgId!, user.sub, dto);
  }
}
