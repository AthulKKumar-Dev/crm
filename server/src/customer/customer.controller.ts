import { Controller, Get, Patch, Param, Query, Body } from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CustomerService } from './customer.service';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) { }

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: QueryCustomersDto) {
    return this.customerService.findAll(user.orgId!, query);
  }

  @Get('tags')
  getTags(@CurrentUser() user: JwtPayload) {
    return this.customerService.getTags(user.orgId!);
  }

  @Get('segments')
  getSegments(@CurrentUser() user: JwtPayload) {
    return this.customerService.getSegments(user.orgId!);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.customerService.findOne(id, user.orgId!);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Body() dto: UpdateCustomerDto) {
    return this.customerService.update(id, user.orgId!, user.sub, dto);
  }
}