import { Injectable, Logger } from '@nestjs/common';
import { ClassSessionStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

export const recurrenceSchema = z.object({
  classTypeId: z.string().min(1),
  instructorId: z.string().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMin: z.number().int().positive(),
  room: z.string().optional(),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime().optional(),
});

function setTime(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date.getTime());
  d.setUTCHours(h, m, 0, 0);
  return d;
}

@Injectable()
export class RecurrenceExpanderService {
  private readonly logger = new Logger(RecurrenceExpanderService.name);
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const recs = await this.prisma.classRecurrence.findMany({
      where: { tenantId, active: true },
      orderBy: { createdAt: 'desc' },
      include: { classType: { select: { id: true, nameEn: true } } },
    });

    const ids = [...new Set(recs.map((r) => r.instructorId).filter((id): id is string => id != null))];
    const staffMap = new Map<string, { id: string; fullName: string }>();
    if (ids.length > 0) {
      const staff = await this.prisma.staff.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, fullName: true },
      });
      staff.forEach((s) => staffMap.set(s.id, s));
    }

    return recs.map((r) => ({
      ...r,
      instructor: r.instructorId ? (staffMap.get(r.instructorId) ?? null) : null,
    }));
  }

  async create(tenantId: string, input: unknown) {
    const parsed = recurrenceSchema.parse(input);
    return this.prisma.classRecurrence.create({
      data: {
        tenantId,
        classTypeId: parsed.classTypeId,
        instructorId: parsed.instructorId,
        daysOfWeek: parsed.daysOfWeek,
        startTime: parsed.startTime,
        durationMin: parsed.durationMin,
        room: parsed.room,
        validFrom: new Date(parsed.validFrom),
        validUntil: parsed.validUntil ? new Date(parsed.validUntil) : null,
      },
    });
  }

  async deactivate(tenantId: string, id: string) {
    return this.prisma.classRecurrence.updateMany({
      where: { id, tenantId },
      data: { active: false },
    });
  }

  /**
   * Materialise concrete ClassSession rows up to `horizon` days into the future
   * for every active recurrence in the given tenant (or all tenants).
   * Idempotent via (recurrenceRuleId, startsAt) unique constraint.
   */
  async expandAll(horizonDays = 30, now: Date = new Date()): Promise<{ created: number }> {
    const horizon = new Date(now.getTime() + horizonDays * 86400000);
    const recs = await this.prisma.classRecurrence.findMany({
      where: {
        active: true,
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
      },
    });

    let created = 0;
    for (const rec of recs) {
      const startCursor = rec.generatedThrough && rec.generatedThrough > now ? rec.generatedThrough : now;
      const endCursor = rec.validUntil && rec.validUntil < horizon ? rec.validUntil : horizon;
      const sessions: Array<{ startsAt: Date; endsAt: Date }> = [];
      const cursor = new Date(startCursor.getTime());
      cursor.setUTCHours(0, 0, 0, 0);
      while (cursor <= endCursor) {
        if (rec.daysOfWeek.includes(cursor.getUTCDay())) {
          const startsAt = setTime(cursor, rec.startTime);
          if (startsAt >= startCursor && startsAt <= endCursor) {
            const endsAt = new Date(startsAt.getTime() + rec.durationMin * 60_000);
            sessions.push({ startsAt, endsAt });
          }
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      for (const s of sessions) {
        try {
          await this.prisma.classSession.create({
            data: {
              tenantId: rec.tenantId,
              classTypeId: rec.classTypeId,
              instructorId: rec.instructorId,
              recurrenceRuleId: rec.id,
              startsAt: s.startsAt,
              endsAt: s.endsAt,
              room: rec.room,
              status: ClassSessionStatus.SCHEDULED,
            },
          });
          created += 1;
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            // Already materialised (unique constraint) — ignore
            continue;
          }
          this.logger.error(`Failed to materialise session for recurrence ${rec.id}: ${(err as Error).message}`);
        }
      }
      await this.prisma.classRecurrence.update({
        where: { id: rec.id },
        data: { generatedThrough: endCursor },
      });
    }
    this.logger.log(`Materialised ${created} class sessions across ${recs.length} recurrences`);
    return { created };
  }
}
