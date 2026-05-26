import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { MembershipRenewalScheduler } from './membership-renewal.scheduler';
import { MembershipPlansService } from './membership-plans.service';
import { MembershipsService } from './memberships.service';

@Controller('memberships')
@UseGuards(ClerkAuthGuard)
export class MembershipsController {
  constructor(
    private readonly plans: MembershipPlansService,
    private readonly memberships: MembershipsService,
    private readonly renewalScheduler: MembershipRenewalScheduler,
  ) {}

  @Get('plans')
  listPlans(@CurrentUser() user: AuthenticatedUser, @Query('active') active?: string) {
    return this.plans.list(user.tenantId, active === 'true');
  }

  @Post('plans')
  createPlan(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.plans.create(user.tenantId, body);
  }

  @Patch('plans/:id')
  updatePlan(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.plans.update(user.tenantId, id, body);
  }

  @Delete('plans/:id')
  archivePlan(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.plans.archive(user.tenantId, id);
  }

  /** Returns upcoming renewals for this tenant (PENDING_PAYMENT memberships within window). */
  @Get('renewals')
  listRenewals(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string) {
    const windowDays = days ? Math.min(Math.max(parseInt(days, 10) || 30, 1), 90) : 30;
    return this.memberships.listRenewals(user.tenantId, windowDays);
  }

  /** Manually trigger auto-renewal processing (operator convenience). */
  @Post('process-renewals')
  processRenewals() {
    return this.renewalScheduler.runProcessNow();
  }

  /** Manually trigger pending-renewal reminder dispatch. */
  @Post('send-renewal-reminders')
  sendRenewalReminders() {
    return this.renewalScheduler.runRemindersNow();
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('memberId') memberId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const s = status && status in MembershipStatus ? (status as MembershipStatus) : undefined;
    const p = page ? Math.max(parseInt(page, 10) || 1, 1) : 1;
    const ps = pageSize ? Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100) : 25;
    return this.memberships.list(user.tenantId, s, memberId, search, p, ps);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.memberships.create(user.tenantId, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.memberships.get(user.tenantId, id);
  }

  @Post(':id/activate')
  activate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.memberships.activate(user.tenantId, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.memberships.cancel(user.tenantId, id, body?.reason);
  }

  @Post(':id/freeze')
  freeze(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.memberships.freeze(user.tenantId, id, body, user.id);
  }

  @Post(':id/unfreeze')
  unfreeze(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.memberships.unfreeze(user.tenantId, id);
  }

  @Post(':id/change-plan')
  changePlan(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.memberships.changePlan(user.tenantId, id, body);
  }
}
