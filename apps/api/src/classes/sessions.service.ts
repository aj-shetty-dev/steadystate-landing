import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BookingStatus, ClassSessionStatus, Locale } from '@prisma/client';
import { z } from 'zod';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';

export const sessionInputSchema = z.object({
  classTypeId: z.string().min(1),
  instructorId: z.string().optional(),
  startsAt: z.string().datetime(),
  durationMin: z.number().int().positive().optional(),
  room: z.string().optional(),
  capacityOverride: z.number().int().positive().optional(),
});

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationDispatcher,
  ) {}

  list(tenantId: string, opts: { from?: Date; to?: Date; instructorId?: string; classTypeId?: string; status?: string; room?: string } = {}) {
    return this.prisma.classSession.findMany({
      where: {
        tenantId,
        ...(opts.from || opts.to
          ? { startsAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
          : {}),
        ...(opts.instructorId ? { instructorId: opts.instructorId } : {}),
        ...(opts.classTypeId ? { classTypeId: opts.classTypeId } : {}),
        ...(opts.room ? { room: opts.room } : {}),
        ...(opts.status ? { status: opts.status as ClassSessionStatus } : {}),
      },
      orderBy: { startsAt: 'asc' },
      include: {
        classType: { select: { id: true, nameEn: true, nameAr: true, capacity: true, color: true } },
        instructor: { select: { id: true, fullName: true } },
        _count: { select: { bookings: true } },
      },
    });
  }

  async get(tenantId: string, id: string) {
    const s = await this.prisma.classSession.findFirst({
      where: { id, tenantId },
      include: {
        classType: true,
        instructor: { select: { id: true, fullName: true } },
        bookings: {
          include: { member: { select: { id: true, fullName: true, phone: true, membershipStatus: true } } },
          orderBy: { bookedAt: 'asc' },
        },
      },
    });
    if (!s) throw new NotFoundException('Session not found');
    return s;
  }

  async create(tenantId: string, input: unknown) {
    const parsed = sessionInputSchema.parse(input);
    const ct = await this.prisma.classType.findFirst({
      where: { id: parsed.classTypeId, tenantId, active: true },
    });
    if (!ct) throw new NotFoundException('Class type not found');
    if (parsed.instructorId) {
      const instructor = await this.prisma.staff.findFirst({
        where: { id: parsed.instructorId, tenantId, active: true },
        select: { id: true },
      });
      if (!instructor) throw new BadRequestException('Instructor not found or inactive');
    }
    const startsAt = new Date(parsed.startsAt);
    const duration = parsed.durationMin ?? ct.durationMin;
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    return this.prisma.classSession.create({
      data: {
        tenantId,
        classTypeId: parsed.classTypeId,
        instructorId: parsed.instructorId,
        startsAt,
        endsAt,
        room: parsed.room,
        capacityOverride: parsed.capacityOverride,
        status: ClassSessionStatus.SCHEDULED,
      },
    });
  }

  async cancel(tenantId: string, id: string) {
    const s = await this.get(tenantId, id);
    if (s.status === ClassSessionStatus.CANCELLED) return s;

    const affected = await this.prisma.booking.findMany({
      where: {
        tenantId,
        sessionId: id,
        status: { in: [BookingStatus.BOOKED, BookingStatus.WAITLISTED, BookingStatus.CHECKED_IN] },
      },
      include: { member: { select: { id: true, fullName: true, phone: true, preferredLocale: true } } },
    });

    const cancelled = await this.prisma.$transaction(async (tx) => {
      await tx.booking.updateMany({
        where: {
          tenantId,
          sessionId: id,
          status: { in: [BookingStatus.BOOKED, BookingStatus.WAITLISTED, BookingStatus.CHECKED_IN] },
        },
        data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
      });
      return tx.classSession.update({
        where: { id },
        data: { status: ClassSessionStatus.CANCELLED },
      });
    });

    const className = s.classType.nameEn;
    const classNameAr = s.classType.nameAr ?? s.classType.nameEn;
    const when = s.startsAt.toLocaleString('en-AE', {
      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dubai',
    });
    for (const b of affected) {
      if (!b.member?.phone) continue;
      try {
        await this.notifications.dispatch({
          tenantId,
          memberId: b.memberId,
          to: b.member.phone,
          body: `Hi ${b.member.fullName}, your ${className} class on ${when} has been cancelled. We're sorry for the inconvenience.`,
          bodyAr: `مرحباً ${b.member.fullName}، تم إلغاء حصة ${classNameAr} المقررة في ${when}. نعتذر عن الإزعاج.`,
          templateName: 'class_session_cancelled',
          category: 'class_session_cancelled',
          locale: b.member.preferredLocale ?? Locale.EN,
        });
      } catch (err) {
        this.logger.error(`Cancel-notify failed for booking ${b.id}: ${(err as Error).message}`);
      }
    }

    return cancelled;
  }

  async reschedule(tenantId: string, id: string, newStartsAt: Date) {
    const s = await this.get(tenantId, id);
    if (s.status !== ClassSessionStatus.SCHEDULED) {
      throw new BadRequestException('Can only reschedule scheduled sessions');
    }
    const duration = s.endsAt.getTime() - s.startsAt.getTime();
    const updated = await this.prisma.classSession.update({
      where: { id },
      data: { startsAt: newStartsAt, endsAt: new Date(newStartsAt.getTime() + duration) },
    });
    // Notify all BOOKED/WAITLISTED members about the time change
    const booked = await this.prisma.booking.findMany({
      where: { tenantId, sessionId: id, status: { in: [BookingStatus.BOOKED, BookingStatus.WAITLISTED] } },
      include: { member: { select: { id: true, fullName: true, phone: true, preferredLocale: true } } },
    });
    const className = s.classType.nameEn;
    const classNameAr = s.classType.nameAr ?? s.classType.nameEn;
    const when = newStartsAt.toLocaleString('en-AE', {
      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dubai',
    });
    for (const b of booked) {
      if (!b.member?.phone) continue;
      try {
        await this.notifications.dispatch({
          tenantId,
          memberId: b.memberId,
          to: b.member.phone,
          body: `Hi ${b.member.fullName}, your ${className} class has been rescheduled to ${when}.`,
          bodyAr: `مرحباً ${b.member.fullName}، تم إعادة جدولة حصة ${classNameAr} إلى ${when}.`,
          templateName: 'class_session_rescheduled',
          category: 'class_session_rescheduled',
          locale: b.member.preferredLocale ?? Locale.EN,
        });
      } catch (err) {
        this.logger.error(`Reschedule-notify failed for booking ${b.id}: ${(err as Error).message}`);
      }
    }
    return updated;
  }
}
