import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { PaymentsService } from '../payments/payments.service';
import { PosService } from './pos.service';

@Controller('pos/sales')
@UseGuards(ClerkAuthGuard)
export class PosController {
  constructor(
    private readonly pos: PosService,
    private readonly payments: PaymentsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('memberId') memberId?: string,
    @Query('staffId') staffId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('take', new DefaultValuePipe(100), ParseIntPipe) take?: number,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip?: number,
  ) {
    return this.pos.list(user.tenantId, {
      memberId,
      staffId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      take,
      skip,
    });
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.pos.create(user.tenantId, body);
  }

  @Get('reports/daily')
  daily(@CurrentUser() user: AuthenticatedUser, @Query('date') date?: string) {
    return this.pos.dailyTotals(user.tenantId, date ? new Date(date) : new Date());
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.pos.get(user.tenantId, id);
  }

  @Post(':id/payment-intent')
  pay(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payments.createSalePaymentIntent(user.tenantId, id);
  }

  @Post(':id/refund')
  refund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { amountAed?: number },
  ) {
    return this.payments.refundSale(user.tenantId, id, body.amountAed);
  }
}
