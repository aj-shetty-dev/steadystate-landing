import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentMember } from '../auth/current-member.decorator';
import { MemberAuthGuard } from '../auth/member-auth.guard';
import type { AuthenticatedMember } from '../auth/member-auth.guard';
import { BookingsService } from '../classes/bookings.service';
import { SessionsService } from '../classes/sessions.service';
import { CheckInService } from '../checkin/checkin.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('m')
@UseGuards(MemberAuthGuard)
export class MemberPortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly bookings: BookingsService,
    private readonly checkin: CheckInService,
    private readonly notifications: NotificationDispatcher,
  ) {}

  @Get('me')
  async me(@CurrentMember() m: AuthenticatedMember) {
    const member = await this.prisma.member.findFirst({
      where: { id: m.memberId, tenantId: m.tenantId },
      include: {
        memberships: {
          where: { status: { in: ['ACTIVE', 'FROZEN', 'PENDING_PAYMENT'] } },
          include: { plan: { select: { nameEn: true, nameAr: true } } },
          orderBy: { endDate: 'desc' },
          take: 5,
        },
      },
    });
    return member;
  }

  @Get('classes/upcoming')
  upcoming(@CurrentMember() m: AuthenticatedMember) {
    return this.sessions.list(m.tenantId, { from: new Date() });
  }

  @Get('bookings')
  myBookings(@CurrentMember() m: AuthenticatedMember) {
    return this.prisma.booking.findMany({
      where: { tenantId: m.tenantId, memberId: m.memberId },
      include: { session: { include: { classType: { select: { nameEn: true } } } } },
      orderBy: { bookedAt: 'desc' },
      take: 50,
    });
  }

  @Post('bookings')
  book(@CurrentMember() m: AuthenticatedMember, @Body() body: { sessionId: string }) {
    return this.bookings.book(m.tenantId, { sessionId: body.sessionId, memberId: m.memberId });
  }

  @Get('qr')
  qr(@CurrentMember() m: AuthenticatedMember) {
    return this.checkin.getMyQr(m.tenantId, m.memberId);
  }

  @Get('checkins')
  checkins(@CurrentMember() m: AuthenticatedMember) {
    return this.checkin.list(m.tenantId, { memberId: m.memberId });
  }

  @Get('invoices')
  invoices(@CurrentMember() m: AuthenticatedMember) {
    return this.prisma.invoice.findMany({
      where: { tenantId: m.tenantId, memberId: m.memberId },
      orderBy: { dueDate: 'desc' },
      take: 50,
    });
  }

  @Get('notifications')
  notifs(@CurrentMember() m: AuthenticatedMember) {
    return this.notifications.listForMember(m.tenantId, m.memberId);
  }
}
