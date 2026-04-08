import { Controller, Get, Patch, Param, Query, Body } from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProductService } from './product.service';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductGstDto } from './dto/update-product-gst.dto';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) { }

  // GET /api/v1/products?page=1&status=ACTIVE&search=shirt&stockStatus=low_stock
  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: QueryProductsDto) {
    return this.productService.findAll(user.orgId!, query);
  }

  // GET /api/v1/products/vendors — for filter dropdown
  @Get('vendors')
  getVendors(@CurrentUser() user: JwtPayload) {
    return this.productService.getVendors(user.orgId!);
  }

  // GET /api/v1/products/types — for filter dropdown
  @Get('types')
  getProductTypes(@CurrentUser() user: JwtPayload) {
    return this.productService.getProductTypes(user.orgId!);
  }

  // GET /api/v1/products/stats — PLACE BEFORE :id route
  @Get('stats')
  getStats(@CurrentUser() user: JwtPayload, @Query('channelId') channelId?: string) {
    return this.productService.getStats(user.orgId!, channelId);
  }

  // GET /api/v1/products/:id — full detail with all variants and images
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.productService.findOne(id, user.orgId!);
  }

  // PATCH /api/v1/products/:id/gst — update HSN code and GST rate
  // Separate from core product data because HSN/GST are CRM-managed,
  // not synced from Shopify. This avoids conflicts with sync.
  @Patch(':id/gst')
  updateGst(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProductGstDto,
  ) {
    return this.productService.updateGst(id, user.orgId!, dto);
  }
}