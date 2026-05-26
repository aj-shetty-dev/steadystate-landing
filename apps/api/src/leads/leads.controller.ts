import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { LeadStage } from '@prisma/client';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { LeadsService } from './leads.service';

@Controller('leads')
@UseGuards(ClerkAuthGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('stage') stage?: string,
    @Query('assignedToUserId') assignedToUserId?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const s = stage && stage in LeadStage ? (stage as LeadStage) : undefined;
    const t = take ? Number.parseInt(take, 10) : undefined;
    const k = skip ? Number.parseInt(skip, 10) : undefined;
    return this.leads.list(user.tenantId, {
      stage: s,
      assignedToUserId,
      take: Number.isFinite(t) ? t : undefined,
      skip: Number.isFinite(k) ? k : undefined,
    });
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.leads.create(user.tenantId, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leads.get(user.tenantId, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.leads.update(user.tenantId, id, body);
  }

  @Post(':id/activities')
  addActivity(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.leads.addActivity(user.tenantId, id, user.id, body);
  }

  @Post(':id/convert')
  convert(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.leads.convert(user.tenantId, id, body);
  }
}
