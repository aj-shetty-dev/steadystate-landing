import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BookingStatus, ClassSessionStatus, FreezeStatus, Locale, MembershipStatus } from '@prisma/client';
import { z } from 'zod';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';

export const bookingInputSchema = z.object({
  sessionId: z.string().min(1),
  memberId: z.string().min(1),
});

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationDispatcher,
  ) {}

  list(tenantId: string, opts: { memberId?: string; sessionId?: string; status?: BookingStatus } = {}) {
    return this.prisma.booking.findMany({
      where: {
        tenantId,
        ...(opts.memberId ? { memberId: opts.memberId } : {}),
        ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { bookedAt: 'desc' },
      include: {
        session: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            room: true,
            classType: { select: { id: true, nameEn: true, color: true } },
            instructor: { select: { id: true, fullName: true } },
          },
        },
        member: { select: { id: true, fullName: true, phone: true, membershipStatus: true } },
      },
    });
  }

  async book(tenantId: string, input: unknown) {
    const parsed = bookingInputSchema.parse(input);
    const [session, member, existing] = await Promise.all([
      this.prisma.classSession.findFirst({
        where: { id: parsed.sessionId, tenantId },
        include: { classType: { select: { capacity: true, dropInPriceAed: true } }, _count: { select: { bookings: { where: { status: { in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN] } } } } } },
      }),
      this.prisma.member.findFirst({
        where: { id: parsed.memberId, tenantId },
        select: { id: true, membershipStatus: true },
      }),
      this.prisma.booking.findFirst({
        where: { sessionId: parsed.sessionId, memberId: parsed.memberId, tenantId },
      }),
    ]);
    if (!session) throw new NotFoundException('Session not found');
    if (!member) throw new NotFoundException('Member not found');
    if (session.startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('Cannot book a session that has already started');
    }
    if (session.status !== ClassSessionStatus.SCHEDULED) {
      throw new BadRequestException(`Cannot book a ${session.status} session`);
    }
    if (existing && existing.status !== BookingStatus.CANCELLED) {
      throw new ConflictException('Already booked');
    }

    if (member.membershipStatus === MembershipStatus.FROZEN) {
      const conflictingFreeze = await this.prisma.membershipFreeze.findFirst({
        where: {
          tenantId,
          status: FreezeStatus.ACTIVE,
          startDate: { lte: session.startsAt },
          endDate: { gte: session.startsAt },
          membership: { memberId: parsed.memberId, tenantId },
        },
        select: { id: true },
      });
      if (conflictingFreeze) {
        throw new BadRequestException('Member is on freeze during this session');
      }
    }

    const capacity = session.capacityOverride ?? session.classType.capacity;

    const eligible =
      member.membershipStatus === MembershipStatus.ACTIVE ||
      member.membershipStatus === MembershipStatus.FROZEN;
    if (!eligible && !session.classType.dropInPriceAed) {
      throw new BadRequestException('Member has no active membership and no drop-in price configured');
    }

    // Re-evaluate capacity inside transaction to avoid double-booking race
    return this.prisma.$transaction(async (tx) => {
      const taken = await tx.booking.count({
        where: { sessionId: parsed.sessionId, tenantId, status: { in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN] } },
      });
      const overCapacity = taken >= capacity;
      const waitlistAhead = overCapacity
        ? await tx.booking.count({ where: { sessionId: parsed.sessionId, tenantId, status: BookingStatus.WAITLISTED } })
        : 0;

      if (existing) {
        return tx.booking.update({
          where: { id: existing.id },
          data: {
            status: overCapacity ? BookingStatus.WAITLISTED : BookingStatus.BOOKED,
            position: overCapacity ? waitlistAhead + 1 : null,
            cancelledAt: null,
          },
          include: { member: { select: { id: true, fullName: true, phone: true, membershipStatus: true } } },
        });
      }
      return tx.booking.create({
        data: {
          tenantId,
          sessionId: parsed.sessionId,
          memberId: parsed.memberId,
          status: overCapacity ? BookingStatus.WAITLISTED : BookingStatus.BOOKED,
          position: overCapacity ? waitlistAhead + 1 : null,
        },
        include: { member: { select: { id: true, fullName: true, phone: true, membershipStatus: true } } },
      });
    });
  }

  async cancel(tenantId: string, id: string) {
    const b = await this.prisma.booking.findFirst({ where: { id, tenantId } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status === BookingStatus.CANCELLED) return b;
    const { cancelled, promotedId } = await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.booking.update({
        where: { id },
        data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
      });
      // promote first waitlisted, if any
      const next = await tx.booking.findFirst({
        where: { sessionId: b.sessionId, tenantId, status: BookingStatus.WAITLISTED },
        orderBy: { position: 'asc' },
      });
      let promotedId: string | null = null;
      if (next) {
        await tx.booking.update({
          where: { id: next.id },
          data: { status: BookingStatus.BOOKED, position: null },
        });
        promotedId = next.id;
      }
      return { cancelled, promotedId };
    });

    if (promotedId) {
      try {
        const promoted = await this.prisma.booking.findFirst({
          where: { id: promotedId, tenantId },
          include: {
            member: { select: { id: true, fullName: true, phone: true, preferredLocale: true } },
            session: { include: { classType: { select: { nameEn: true, nameAr: true } } } },
          },
        });
        if (promoted?.member?.phone) {
          const className = promoted.session.classType.nameEn;
          const classNameAr = promoted.session.classType.nameAr ?? className;
          const when = promoted.session.startsAt.toLocaleString('en-AE', {
            day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dubai',
          });
          await this.notifications.dispatch({
            tenantId,
            memberId: promoted.memberId,
            to: promoted.member.phone,
            body: `Good news ${promoted.member.fullName}! A spot opened up in ${className} on ${when} — you're now confirmed.`,
            bodyAr: `أخبار جيدة ${promoted.member.fullName}! تم تأكيد حجزك في حصة ${classNameAr} يوم ${when}.`,
            templateName: 'class_waitlist_promoted',
            category: 'class_waitlist_promoted',
            locale: promoted.member.preferredLocale ?? Locale.EN,
          });
        }
      } catch (err) {
        this.logger.error(`Waitlist-promote notify failed: ${(err as Error).message}`);
      }
    }

    return cancelled;
  }

  async checkIn(tenantId: string, id: string) {
    const b = await this.prisma.booking.findFirst({ where: { id, tenantId } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status === BookingStatus.CHECKED_IN) return b;
    if (b.status !== BookingStatus.BOOKED) {
      throw new BadRequestException(`Cannot check in a ${b.status} booking`);
    }
    return this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CHECKED_IN, checkedInAt: new Date() },
    });
  }
}
