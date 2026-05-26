import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ReportingService } from './reporting.service';

function parseRange(from?: string, to?: string) {
  return {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  };
}

@Controller('reports')
@UseGuards(ClerkAuthGuard)
export class ReportingController {
  constructor(private readonly svc: ReportingService) {}

  @Get('revenue')
  revenue(@CurrentUser() u: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.revenue(u.tenantId, parseRange(from, to));
  }

  @Get('member-growth')
  growth(@CurrentUser() u: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.memberGrowth(u.tenantId, parseRange(from, to));
  }

  @Get('class-utilization')
  classes(@CurrentUser() u: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.classUtilization(u.tenantId, parseRange(from, to));
  }

  @Get('staff-commission')
  commission(@CurrentUser() u: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.staffCommission(u.tenantId, parseRange(from, to));
  }
}
