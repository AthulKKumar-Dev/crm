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
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { QueryGstReturnDto } from './dto/query-gst-return.dto';

@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  // POST /api/v1/invoices — generate a GST invoice for an order
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateInvoiceDto) {
    return this.invoiceService.create(user.orgId!, dto);
  }

  // GET /api/v1/invoices/gst-return — GSTR-1 or GSTR-3B summary
  // IMPORTANT: static routes BEFORE :id param route
  @Get('gst-return')
  getGstReturn(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryGstReturnDto,
  ) {
    return this.invoiceService.getGstReturn(user.orgId!, query);
  }

  // GET /api/v1/invoices/gst-return/export/csv — download GST return as CSV
  @Get('gst-return/export/csv')
  async exportGstReturnCsv(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryGstReturnDto,
    @Res() res: Response,
  ) {
    const data = await this.invoiceService.getGstReturnExportData(user.orgId!, query);
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
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryInvoicesDto,
    @Res() res: Response,
  ) {
    const data = await this.invoiceService.getExportData(user.orgId!, query);

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
        'cgst',
        'sgst',
        'igst',
        'totalTax',
        'grandTotal',
        'status',
      ],
    });
    const csv = parser.parse(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=invoices.csv',
    );
    res.send(csv);
  }

  // GET /api/v1/invoices/export/json — export invoices as JSON
  @Get('export/json')
  async exportJson(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryInvoicesDto,
  ) {
    return this.invoiceService.getExportData(user.orgId!, query);
  }

  // GET /api/v1/invoices — list invoices (paginated)
  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: QueryInvoicesDto) {
    return this.invoiceService.findAll(user.orgId!, query);
  }

  // GET /api/v1/invoices/:id — get full invoice detail
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.invoiceService.findOne(id, user.orgId!);
  }

  // POST /api/v1/invoices/:id/cancel — cancel an issued invoice
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.invoiceService.cancel(id, user.orgId!);
  }
}
