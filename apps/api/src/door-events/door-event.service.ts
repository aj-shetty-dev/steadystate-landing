import { Injectable, Logger } from '@nestjs/common';
import { DoorEventDirection } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { deriveSignals } from './derive-signals';

export const doorEventSchema = z.object({
  direction: z.enum(['IN', 'OUT']),
  occurredAt: z.string().datetime().or(z.number().int()),
  externalRef: z.string().max(120).optional(),
  source: z.string().max(60).default('webhook'),
  memberExternalId: z.string().max(120).optional(),
  raw: z.record(z.unknown()).optional(),
});

export type DoorEventInput = z.infer<typeof doorEventSchema>;

@Injectable()
export class DoorEventService {
  private readonly logger = new Logger(DoorEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingest(tenantId: string, input: unknown) {
    const parsed = doorEventSchema.parse(input);
    const occurredAt = typeof parsed.occurredAt === 'number'
      ? new Date(parsed.occurredAt)
      : new Date(parsed.occurredAt);

    let memberId: string | null = null;
    if (parsed.memberExternalId) {
      const member = await this.prisma.member.findFirst({
        where: { tenantId, externalId: parsed.memberExternalId },
        select: { id: true },
      });
      memberId = member?.id ?? null;
    }

    const event = await this.prisma.doorEvent.create({
      data: {
        tenantId,
        memberId,
        externalRef: parsed.externalRef ?? null,
        source: parsed.source,
        direction: parsed.direction as DoorEventDirection,
        occurredAt,
        raw: (parsed.raw ?? null) as never,
      },
    });

    const signals = deriveSignals({
      direction: event.direction,
      occurredAt: event.occurredAt,
      memberId: event.memberId,
      externalRef: event.externalRef,
      source: event.source,
    });

    if (signals.length > 0) {
      await this.prisma.doorSignal.createMany({
        data: signals.map((s) => ({
          tenantId,
          memberId: event.memberId,
          kind: s.kind,
          detail: s.detail,
          detectedAt: event.occurredAt,
          raw: { eventId: event.id } as never,
        })),
      });
    }

    this.logger.log(`Door event tenant=${tenantId} dir=${event.direction} signals=${signals.length}`);
    return { eventId: event.id, signals: signals.length };
  }

  listEvents(tenantId: string, page: number, pageSize: number) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    return this.prisma.$transaction([
      this.prisma.doorEvent.findMany({
        where: { tenantId },
        orderBy: { occurredAt: 'desc' },
        skip,
        take,
        include: { member: { select: { id: true, fullName: true } } },
      }),
      this.prisma.doorEvent.count({ where: { tenantId } }),
    ]).then(([items, total]) => ({ items, total, page: Math.max(page, 1), pageSize: take }));
  }

  listSignals(tenantId: string, page: number, pageSize: number) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    return this.prisma.$transaction([
      this.prisma.doorSignal.findMany({
        where: { tenantId },
        orderBy: { detectedAt: 'desc' },
        skip,
        take,
        include: { member: { select: { id: true, fullName: true } } },
      }),
      this.prisma.doorSignal.count({ where: { tenantId } }),
    ]).then(([items, total]) => ({ items, total, page: Math.max(page, 1), pageSize: take }));
  }
}
