import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { OrgId } from '../auth/decorators/org-id.decorator';
import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { QueryGstReturnDto } from './dto/query-gst-return.dto';
import { QueryInvoiceStatsDto } from './dto/query-invoice-stats.dto';
import { ORG_MANAGERS, Roles } from '../auth/decorators/roles.decorator';

@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  // POST /api/v1/invoices — generate a GST invoice for an order
  @Post()
  @Roles(...ORG_MANAGERS)
  create(@OrgId() orgId: string, @Body() dto: CreateInvoiceDto) {
    return this.invoiceService.create(orgId, dto);
  }

  // GET /api/v1/invoices/stats — KPI aggregates and filter-chip counts
  // IMPORTANT: static routes BEFORE :id param route
  @Get('stats')
  getStats(@OrgId() orgId: string, @Query() query: QueryInvoiceStatsDto) {
    return this.invoiceService.getStats(orgId, query);
  }

  // GET /api/v1/invoices/gst-return — GSTR-1 or GSTR-3B summary
  // IMPORTANT: static routes BEFORE :id param route
  @Get('gst-return')
  getGstReturn(
    @OrgId() orgId: string,
    @Query() query: QueryGstReturnDto,
  ) {
    return this.invoiceService.getGstReturn(orgId, query);
  }

  // GET /api/v1/invoices/gst-return/export/csv — download GST return as CSV
  @Get('gst-return/export/csv')
  async exportGstReturnCsv(
    @OrgId() orgId: string,
    @Query() query: QueryGstReturnDto,
    @Res() res: Response,
  ) {
    const data = await this.invoiceService.getGstReturnExportData(orgId, query);
    const { Parser } = await import('json2csv');

    const isGstr3b = query.returnType === 'GSTR3B';
    const fields = isGstr3b
      ? ['section', 'gstRate', 'taxableValue', 'cgst', 'sgst', 'igst', 'totalTax']
      : ['section', 'buyerGstin', 'buyerName', 'invoiceNumber', 'invoiceDate', 'placeOfSupply', 'taxableValue', 'cgst', 'sgst', 'igst', 'totalTax', 'grandTotal'];

    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    const filename = `${query.returnType || 'GSTR1'}-${query.financialYear}-${query.period}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csv);
  }

  // GET /api/v1/invoices/export/csv — export invoices as CSV
  @Get('export/csv')
  async exportCsv(
    @OrgId() orgId: string,
    @Query() query: QueryInvoicesDto,
    @Res() res: Response,
  ) {
    const data = await this.invoiceService.getExportData(orgId, query);

    // Use json2csv pattern from order controller
    const { Parser } = await import('json2csv');
    const parser = new Parser({
      fields: [
        'invoiceNumber',
        'invoiceDate',
        'financialYear',
        'orderNumber',
        'buyerName',
        'buyerGstin',
        'placeOfSupply',
        'gstType',
        'subtotal',
        'discount',
        'cgst',
        'sgst',
        'igst',
        'totalTax',
        // subtotal + totalTax + shipping = grandTotal. Without the shipping
        // column the row does not reconcile and reads as an arithmetic error.
        'shipping',
        'grandTotal',
        'status',
      ],
    });
    const csv = parser.parse(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=invoices${query.financialYear ? `-${query.financialYear}` : ''}.csv`,
    );
    res.send(csv);
  }

  // GET /api/v1/invoices/export/json — export invoices as JSON
  @Get('export/json')
  async exportJson(
    @OrgId() orgId: string,
    @Query() query: QueryInvoicesDto,
  ) {
    return this.invoiceService.getExportData(orgId, query);
  }

  // GET /api/v1/invoices — list invoices (paginated)
  @Get()
  findAll(@OrgId() orgId: string, @Query() query: QueryInvoicesDto) {
    return this.invoiceService.findAll(orgId, query);
  }

  // GET /api/v1/invoices/:id — get full invoice detail
  @Get(':id')
  findOne(@Param('id') id: string, @OrgId() orgId: string) {
    return this.invoiceService.findOne(id, orgId);
  }

  // POST /api/v1/invoices/:id/cancel — cancel an issued invoice
  @Post(':id/cancel')
  @Roles(...ORG_MANAGERS)
  cancel(@Param('id') id: string, @OrgId() orgId: string) {
    return this.invoiceService.cancel(id, orgId);
  }
}
