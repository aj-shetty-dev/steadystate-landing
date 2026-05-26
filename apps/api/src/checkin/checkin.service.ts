import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CheckInSource, MembershipStatus } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { QrTokenService } from './qr-token.service';

export const checkInSchema = z.object({
  source: z.nativeEnum(CheckInSource),
  memberId: z.string().optional(),
  phone: z.string().optional(),
  qrToken: z.string().optional(),
  staffId: z.string().optional(),
  notes: z.string().max(500).optional(),
}).refine(
  (data) => data.memberId || data.phone || data.qrToken,
  { message: 'memberId, phone, or qrToken is required' },
);

const SESSION_LINK_WINDOW_MIN = 30;
const DEDUPE_WINDOW_MIN = 5;

function normalizePhone(raw: string): string {
  const trimmed = raw.replace(/[\s\-()]/g, '');
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('00')) return `+${trimmed.slice(2)}`;
  if (trimmed.startsWith('0')) return `+971${trimmed.slice(1)}`;
  return `+${trimmed}`;
}

@Injectable()
export class CheckInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qr: QrTokenService,
  ) {}

  async resolveMember(tenantId: string, params: { memberId?: string; phone?: string; qrToken?: string }) {
    if (params.memberId) {
      return this.prisma.member.findFirst({ where: { id: params.memberId, tenantId } });
    }
    if (params.qrToken) {
      const tok = await this.qr.resolve(params.qrToken);
      if (!tok || tok.tenantId !== tenantId) return null;
      return this.prisma.member.findFirst({ where: { id: tok.memberId, tenantId } });
    }
    if (params.phone) {
      const normalized = normalizePhone(params.phone);
      const found = await this.prisma.member.findFirst({ where: { phone: normalized, tenantId } });
      if (found) return found;
      // Fall back to raw input in case data isn't normalized in DB yet.
      return this.prisma.member.findFirst({ where: { phone: params.phone, tenantId } });
    }
    return null;
  }

  async create(tenantId: string, input: unknown) {
    const parsed = checkInSchema.parse(input);
    const member = await this.resolveMember(tenantId, parsed);
    if (!member) throw new NotFoundException('Member not found');

    if (
      member.membershipStatus === MembershipStatus.CANCELLED ||
      member.membershipStatus === MembershipStatus.EXPIRED
    ) {
      throw new BadRequestException(
        `Member's membership is ${member.membershipStatus}; cannot check in. Renew first.`,
      );
    }

    if (parsed.staffId) {
      const staff = await this.prisma.staff.findFirst({
        where: { id: parsed.staffId, tenantId, active: true },
        select: { id: true },
      });
      if (!staff) throw new BadRequestException('Staff not found or inactive');
    }

    const now = new Date();

    // Dedupe: reject if a check-in for this member was created within the dedupe window.
    const dedupeSince = new Date(now.getTime() - DEDUPE_WINDOW_MIN * 60_000);
    const recent = await this.prisma.checkIn.findFirst({
      where: { tenantId, memberId: member.id, checkedInAt: { gte: dedupeSince } },
      orderBy: { checkedInAt: 'desc' },
    });
    if (recent) {
      throw new ConflictException(
        `Duplicate check-in: member already checked in within the last ${DEDUPE_WINDOW_MIN} minutes`,
      );
    }

    const windowStart = new Date(now.getTime() - SESSION_LINK_WINDOW_MIN * 60_000);
    const windowEnd = new Date(now.getTime() + SESSION_LINK_WINDOW_MIN * 60_000);
    const booking = await this.prisma.booking.findFirst({
      where: {
        tenantId,
        memberId: member.id,
        status: 'BOOKED',
        session: { startsAt: { gte: windowStart, lte: windowEnd } },
      },
      include: { session: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const ci = await tx.checkIn.create({
        data: {
          tenantId,
          memberId: member.id,
          source: parsed.source,
          staffId: parsed.staffId,
          sessionId: booking?.sessionId,
          notes: parsed.notes,
        },
      });
      await tx.member.update({
        where: { id: member.id },
        data: { lastCheckinAt: now },
      });
      if (booking) {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'CHECKED_IN', checkedInAt: now },
        });
      }
      return ci;
    });
  }

  list(tenantId: string, opts: { memberId?: string; from?: Date; to?: Date; take?: number; skip?: number } = {}) {
    const take = Math.min(Math.max(opts.take ?? 200, 1), 500);
    const skip = Math.max(opts.skip ?? 0, 0);
    return this.prisma.checkIn.findMany({
      where: {
        tenantId,
        ...(opts.memberId ? { memberId: opts.memberId } : {}),
        ...(opts.from || opts.to
          ? { checkedInAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
          : {}),
      },
      orderBy: { checkedInAt: 'desc' },
      take,
      skip,
    });
  }

  async getMyQr(tenantId: string, memberId: string) {
    const m = await this.prisma.member.findFirst({ where: { id: memberId, tenantId }, select: { id: true } });
    if (!m) throw new NotFoundException('Member not found');
    return this.qr.issueOrRefresh(tenantId, memberId);
  }
}
