import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { OrgId } from '../auth/decorators/org-id.decorator';
import { Roles, ORG_MANAGERS, ORG_OPERATORS } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { WarehouseService } from './warehouse.service';
import {
  BulkLocationsDto,
  CreateWarehouseDto,
  UpdateWarehouseDto,
} from './dto/warehouse.dto';

/** Warehouse + location management. Structure changes are manager-level. */
@Controller('warehouses')
export class WarehouseController {
  constructor(private readonly warehouses: WarehouseService) {}

  @Get()
  @Roles(...ORG_OPERATORS)
  @RequirePermissions('inventory.view')
  findAll(@OrgId() orgId: string) {
    return this.warehouses.findAll(orgId);
  }

  @Post()
  @Roles(...ORG_MANAGERS)
  create(@OrgId() orgId: string, @Body() dto: CreateWarehouseDto) {
    return this.warehouses.create(orgId, dto);
  }

  @Patch(':id')
  @Roles(...ORG_MANAGERS)
  update(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.warehouses.update(orgId, id, dto);
  }

  @Get(':id/locations')
  @Roles(...ORG_OPERATORS)
  @RequirePermissions('inventory.view')
  listLocations(@OrgId() orgId: string, @Param('id') id: string) {
    return this.warehouses.listLocations(orgId, id);
  }

  @Post(':id/locations/bulk')
  @Roles(...ORG_MANAGERS)
  bulkCreateLocations(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: BulkLocationsDto,
  ) {
    return this.warehouses.bulkCreateLocations(orgId, id, dto);
  }
}
