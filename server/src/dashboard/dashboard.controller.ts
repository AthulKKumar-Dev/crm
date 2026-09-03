import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { QueryDashboardDto } from './dto/query-dashboard.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) { }

  // GET /api/v1/dashboard?dateFrom=2026-01-01&dateTo=2026-12-31&channelId=xxx
  @Get()
  getOverview(@CurrentUser() user: JwtPayload, @Query() query: QueryDashboardDto) {
    return this.dashboardService.getOverview(user.orgId!, query);
  }

  // GET /api/v1/dashboard/monthly-sales — sales & gross profit, bucketed.
  // Route name kept while the client migrates; the payload is now the source of
  // truth for the stat cards too, not just the chart.
  @Get('monthly-sales')
  getSalesAndProfit(@CurrentUser() user: JwtPayload, @Query() query: QueryDashboardDto) {
    return this.dashboardService.getSalesAndProfit(user.orgId!, query);
  }

  // GET /api/v1/dashboard/sales-by-category — Sales breakdown by product type for donut chart
  @Get('sales-by-category')
  getSalesByCategory(@CurrentUser() user: JwtPayload, @Query() query: QueryDashboardDto) {
    return this.dashboardService.getSalesByCategory(user.orgId!, query);
  }

  // GET /api/v1/dashboard/export/csv — Download orders as CSV
  @Get('export/csv')
  async exportCsv(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryDashboardDto,
    @Res() res: Response,
  ) {
    const data = await this.dashboardService.getReportData(user.orgId!, query);
    const csv = this.dashboardService.generateCsv(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=orders-report.csv');
    res.send(csv);
  }

  // GET /api/v1/dashboard/export/json — Download orders as JSON report
  @Get('export/json')
  async exportJson(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryDashboardDto,
    @Res() res: Response,
  ) {
    const overview = await this.dashboardService.getOverview(user.orgId!, query);
    const orders = await this.dashboardService.getReportData(user.orgId!, query);

    const report = {
      generatedAt: new Date().toISOString(),
      dateRange: { from: query.dateFrom || 'all', to: query.dateTo || 'all' },
      summary: {
        totalSales: overview.totalSales,
        totalOrders: overview.totalOrders,
        totalCustomers: overview.totalCustomers,
        totalProducts: overview.totalProducts,
      },
      orders,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=dashboard-report.json');
    res.send(JSON.stringify(report, null, 2));
  }
}