import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { BookingsService } from './bookings.service';
import { ClassTypesService } from './class-types.service';
import { RecurrenceExpanderService } from './recurrence-expander.service';
import { SessionsService } from './sessions.service';

@Controller('classes')
@UseGuards(ClerkAuthGuard)
export class ClassesController {
  constructor(
    private readonly types: ClassTypesService,
    private readonly recurrence: RecurrenceExpanderService,
    private readonly sessions: SessionsService,
    private readonly bookings: BookingsService,
  ) {}

  @Get('types')
  listTypes(@CurrentUser() user: AuthenticatedUser, @Query('includeArchived') includeArchived?: string) {
    return this.types.list(user.tenantId, includeArchived !== 'true');
  }

  @Post('types')
  createType(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.types.create(user.tenantId, body);
  }

  @Patch('types/:id')
  updateType(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.types.update(user.tenantId, id, body);
  }

  @Delete('types/:id')
  archiveType(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.types.archive(user.tenantId, id);
  }

  @Get('recurrences')
  listRecurrences(@CurrentUser() user: AuthenticatedUser) {
    return this.recurrence.list(user.tenantId);
  }

  @Post('recurrences')
  createRecurrence(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.recurrence.create(user.tenantId, body);
  }

  @Delete('recurrences/:id')
  deactivateRecurrence(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.recurrence.deactivate(user.tenantId, id);
  }

  @Get('sessions')
  listSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('classTypeId') classTypeId?: string,
    @Query('instructorId') instructorId?: string,
    @Query('room') room?: string,
    @Query('status') status?: string,
  ) {
    return this.sessions.list(user.tenantId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      classTypeId: classTypeId || undefined,
      instructorId: instructorId || undefined,
      room: room || undefined,
      status: status || undefined,
    });
  }

  @Post('sessions')
  createSession(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.sessions.create(user.tenantId, body);
  }

  @Get('sessions/:id')
  getSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sessions.get(user.tenantId, id);
  }

  @Patch('sessions/:id')
  rescheduleSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { startsAt?: string },
  ) {
    if (!body.startsAt) throw new BadRequestException('startsAt is required');
    return this.sessions.reschedule(user.tenantId, id, new Date(body.startsAt));
  }

  @Post('sessions/:id/cancel')
  cancelSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sessions.cancel(user.tenantId, id);
  }

  @Post('bookings')
  book(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.bookings.book(user.tenantId, body);
  }

  @Get('bookings')
  listBookings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('memberId') memberId?: string,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.bookings.list(user.tenantId, { memberId, sessionId });
  }

  @Post('bookings/:id/cancel')
  cancelBooking(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookings.cancel(user.tenantId, id);
  }

  @Post('bookings/:id/check-in')
  checkInBooking(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookings.checkIn(user.tenantId, id);
  }
}
