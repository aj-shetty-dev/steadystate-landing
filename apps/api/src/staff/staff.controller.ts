import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ShiftsService } from './shifts.service';
import { StaffService } from './staff.service';

@Controller('staff')
@UseGuards(ClerkAuthGuard)
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly shifts: ShiftsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('includeInactive') includeInactive?: string) {
    return this.staff.list(user.tenantId, includeInactive !== 'true');
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.staff.create(user.tenantId, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.staff.get(user.tenantId, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.staff.update(user.tenantId, id, body);
  }

  @Delete(':id')
  terminate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.staff.terminate(user.tenantId, id);
  }

  @Post(':id/reactivate')
  reactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.staff.reactivate(user.tenantId, id);
  }

  @Get(':id/shifts')
  listShifts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') staffId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.shifts.list(user.tenantId, {
      staffId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }
}

@Controller('shifts')
@UseGuards(ClerkAuthGuard)
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('staffId') staffId?: string,
  ) {
    return this.shifts.list(user.tenantId, {
      staffId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.shifts.create(user.tenantId, body);
  }

  @Post('bulk')
  createBulk(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.shifts.createBulk(user.tenantId, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.shifts.update(user.tenantId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shifts.remove(user.tenantId, id);
  }
}
