import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CheckInService } from './checkin.service';

@Controller('checkins')
@UseGuards(ClerkAuthGuard)
export class CheckInController {
  constructor(private readonly svc: CheckInService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('memberId') memberId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.list(user.tenantId, {
      memberId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.tenantId, body);
  }

  @Get('members/:memberId/qr')
  getQr(@CurrentUser() user: AuthenticatedUser, @Param('memberId') memberId: string) {
    return this.svc.getMyQr(user.tenantId, memberId);
  }
}
