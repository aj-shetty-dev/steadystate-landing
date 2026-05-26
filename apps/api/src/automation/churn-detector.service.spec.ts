import { ChurnSignalStatus, MembershipStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChurnDetectorService } from './churn-detector.service';

type MemberRow = {
  id: string;
  tenantId: string;
  membershipStatus: MembershipStatus;
  lastCheckinAt: Date | null;
  joinedAt: Date;
};

type SignalRow = {
  id: string;
  tenantId: string;
  memberId: string;
  detectedAt: Date;
  daysSinceLastCheckin: number;
  status: ChurnSignalStatus;
};

function createPrismaStub() {
  const members: MemberRow[] = [];
  const signals: SignalRow[] = [];
  let counter = 0;
  return {
    members,
    signals,
    member: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            tenantId: string;
            membershipStatus: MembershipStatus;
            OR: Array<{ lastCheckinAt?: { lte: Date } | null; joinedAt?: { lte: Date } }>;
          };
        }) => {
          const cutoff = (where.OR[0].lastCheckinAt as { lte: Date }).lte;
          return members.filter(
            (m) =>
              m.tenantId === where.tenantId &&
              m.membershipStatus === where.membershipStatus &&
              ((m.lastCheckinAt && m.lastCheckinAt <= cutoff) ||
                (m.lastCheckinAt === null && m.joinedAt <= cutoff)),
          );
        },
      ),
    },
    churnSignal: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { tenantId: string; memberId: string; detectedAt: { gte: Date } };
        }) => {
          return (
            signals.find(
              (s) =>
                s.tenantId === where.tenantId &&
                s.memberId === where.memberId &&
                s.detectedAt >= where.detectedAt.gte,
            ) ?? null
          );
        },
      ),
      create: vi.fn(async ({ data }: { data: Omit<SignalRow, 'id'> }) => {
        const row: SignalRow = { id: `sig_${++counter}`, ...data };
        signals.push(row);
        return row;
      }),
    },
  };
}

const now = new Date('2026-05-10T12:00:00Z');
const day = 24 * 60 * 60 * 1000;

describe('ChurnDetectorService', () => {
  let prisma: ReturnType<typeof createPrismaStub>;
  let service: ChurnDetectorService;

  beforeEach(() => {
    prisma = createPrismaStub();
    service = new ChurnDetectorService(prisma as never);
  });

  it('creates signals only for active members idle past the threshold', async () => {
    prisma.members.push(
      {
        id: 'm1',
        tenantId: 't',
        membershipStatus: MembershipStatus.ACTIVE,
        lastCheckinAt: new Date(now.getTime() - 6 * day),
        joinedAt: new Date(now.getTime() - 100 * day),
      },
      {
        id: 'm2',
        tenantId: 't',
        membershipStatus: MembershipStatus.ACTIVE,
        lastCheckinAt: new Date(now.getTime() - 2 * day),
        joinedAt: new Date(now.getTime() - 100 * day),
      },
      {
        id: 'm3',
        tenantId: 't',
        membershipStatus: MembershipStatus.EXPIRED,
        lastCheckinAt: new Date(now.getTime() - 30 * day),
        joinedAt: new Date(now.getTime() - 100 * day),
      },
    );

    const result = await service.detectForTenant('t', now);
    expect(result.signalsCreated).toBe(1);
    expect(prisma.signals[0].memberId).toBe('m1');
    expect(prisma.signals[0].daysSinceLastCheckin).toBe(6);
  });

  it('flags an active member who has never checked in', async () => {
    prisma.members.push({
      id: 'm4',
      tenantId: 't',
      membershipStatus: MembershipStatus.ACTIVE,
      lastCheckinAt: null,
      joinedAt: new Date(now.getTime() - 10 * day),
    });
    const result = await service.detectForTenant('t', now);
    expect(result.signalsCreated).toBe(1);
    expect(prisma.signals[0].daysSinceLastCheckin).toBe(10);
  });

  it('skips members that already have a signal within cooldown', async () => {
    prisma.members.push({
      id: 'm5',
      tenantId: 't',
      membershipStatus: MembershipStatus.ACTIVE,
      lastCheckinAt: new Date(now.getTime() - 6 * day),
      joinedAt: new Date(now.getTime() - 100 * day),
    });
    prisma.signals.push({
      id: 'pre',
      tenantId: 't',
      memberId: 'm5',
      detectedAt: new Date(now.getTime() - 3 * day),
      daysSinceLastCheckin: 5,
      status: ChurnSignalStatus.NUDGED,
    });

    const result = await service.detectForTenant('t', now);
    expect(result.signalsCreated).toBe(0);
    expect(result.signalsSkipped).toBe(1);
  });
});
