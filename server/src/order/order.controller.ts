import { Controller, Get, Param, Query } from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrderService } from './order.service';
import { QueryOrdersDto } from './dto/query-orders.dto';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) { }

  // GET /api/v1/orders?page=1&limit=20&financialStatus=PAID&search=1001
  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: QueryOrdersDto) {
    return this.orderService.findAll(user.orgId!, query);
  }

  // GET /api/v1/orders/:id
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orderService.findOne(id, user.orgId!);
  }
}