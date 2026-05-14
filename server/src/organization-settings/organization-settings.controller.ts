import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ZodValidationPipe } from './zod-validation.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrganizationSettingsService } from './organization-settings.service';
import { UpdateProductSettingsSchema } from './schemas/product-settings.schema';
import type { UpdateProductSettingsInput } from './schemas/product-settings.schema';
import { UpdateOrderSettingsSchema } from './schemas/order-settings.schema';
import type { UpdateOrderSettingsInput } from './schemas/order-settings.schema';

/**
 * Org-scoped settings, organized by domain. All endpoints implicitly target
 * the caller's org (via JWT) — there is no `/orgs/:id/settings` to keep the
 * surface small.
 *
 * IMPORTANT: pipes here are attached at the @Body() parameter level, NOT via
 * @UsePipes at the method level. @UsePipes runs the pipe on every parameter
 * including @CurrentUser() — Zod's default `strip` mode would silently drop
 * unknown fields on the JwtPayload, leaving `user.orgId` undefined and
 * tripping the service's assertOrgId. The parameter-level form keeps the
 * pipe scoped to the body where it belongs.
 */
@Controller('organization/settings')
export class OrganizationSettingsController {
  constructor(private readonly service: OrganizationSettingsService) {}

  // GET /api/v1/organization/settings
  // Returns all domain settings (productSettings, orderSettings) with defaults.
  @Get()
  getAll(@CurrentUser() user: JwtPayload) {
    return this.service.get(user.orgId!);
  }

  // PATCH /api/v1/organization/settings/products
  @Patch('products')
  updateProducts(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(UpdateProductSettingsSchema))
    body: UpdateProductSettingsInput,
  ) {
    return this.service.updateProductSettings(user.orgId!, body);
  }

  // PATCH /api/v1/organization/settings/orders
  @Patch('orders')
  updateOrders(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(UpdateOrderSettingsSchema))
    body: UpdateOrderSettingsInput,
  ) {
    return this.service.updateOrderSettings(user.orgId!, body);
  }
}
