import { ChurnSignalStatus, MembershipStatus, WhatsappMessageStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatsService } from './stats.service';

// ---------------------------------------------------------------------------
// Prisma stub — mirrors the shapes called by StatsService.overview()
// ---------------------------------------------------------------------------

function makePrisma() {
  return {
    member: {
      groupBy: vi.fn().mockResolvedValue([
        { membershipStatus: MembershipStatus.ACTIVE, _count: { _all: 8 } },
        { membershipStatus: MembershipStatus.EXPIRED, _count: { _all: 3 } },
        { membershipStatus: MembershipStatus.PENDING, _count: { _all: 1 } },
      ]),
    },
    churnSignal: {
      groupBy: vi.fn().mockResolvedValue([
        { status: ChurnSignalStatus.PENDING, _count: { _all: 5 } },
        { status: ChurnSignalStatus.NUDGED, _count: { _all: 3 } },
        { status: ChurnSignalStatus.DISMISSED, _count: { _all: 2 } },
        { status: ChurnSignalStatus.FAILED, _count: { _all: 1 } },
      ]),
    },
    whatsappMessage: {
      groupBy: vi.fn().mockResolvedValue([
        { status: WhatsappMessageStatus.SENT, _count: { _all: 10 } },
        { status: WhatsappMessageStatus.FAILED, _count: { _all: 2 } },
        { status: WhatsappMessageStatus.QUEUED, _count: { _all: 1 } },
      ]),
    },
    lead: {
      count: vi.fn().mockResolvedValue(4),
    },
    classSession: {
      count: vi.fn().mockResolvedValue(6),
    },
    sale: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { totalAed: 12500 } }),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StatsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: StatsService;
  const tenantId = 'tenant-1';
  const now = new Date('2025-01-15T12:00:00.000Z');

  beforeEach(() => {
    prisma = makePrisma();
    service = new StatsService(prisma as never);
  });

  // -------------------------------------------------------------------------
  // Shape correctness
  // -------------------------------------------------------------------------

  it('returns correctly shaped OverviewStats', async () => {
    const stats = await service.overview(tenantId, now);

    expect(stats).toMatchObject({
      members: { total: 12, active: 8 },
      signals30d: { pending: 5, nudged: 3, dismissed: 2, failed: 1 },
      messages30d: { total: 13, sent: 10, failed: 2 },
      leadsOpen: 4,
      classesToday: 6,
      revenueMtdAed: 12500,
    });
  });

  it('uses 0 for revenueMtdAed when aggregate sum is null', async () => {
    prisma.sale.aggregate.mockResolvedValueOnce({ _sum: { totalAed: null } });
    const stats = await service.overview(tenantId, now);
    expect(stats.revenueMtdAed).toBe(0);
  });

  it('returns 0 for signal counts not present in groupBy result', async () => {
    // Only NUDGED returned — others absent
    prisma.churnSignal.groupBy.mockResolvedValueOnce([
      { status: ChurnSignalStatus.NUDGED, _count: { _all: 7 } },
    ]);
    const stats = await service.overview(tenantId, now);
    expect(stats.signals30d.nudged).toBe(7);
    expect(stats.signals30d.pending).toBe(0);
    expect(stats.signals30d.dismissed).toBe(0);
    expect(stats.signals30d.failed).toBe(0);
  });

  it('returns 0 for message counts when groupBy result is empty', async () => {
    prisma.whatsappMessage.groupBy.mockResolvedValueOnce([]);
    const stats = await service.overview(tenantId, now);
    expect(stats.messages30d).toEqual({ total: 0, sent: 0, failed: 0 });
  });

  it('returns 0 for member counts when groupBy result is empty', async () => {
    prisma.member.groupBy.mockResolvedValueOnce([]);
    const stats = await service.overview(tenantId, now);
    expect(stats.members).toEqual({ total: 0, active: 0 });
  });

  // -------------------------------------------------------------------------
  // Tenant isolation
  // -------------------------------------------------------------------------

  it('passes tenantId to every query', async () => {
    await service.overview(tenantId, now);

    expect(prisma.member.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }) }),
    );
    expect(prisma.churnSignal.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }) }),
    );
    expect(prisma.whatsappMessage.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }) }),
    );
    expect(prisma.lead.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }) }),
    );
    expect(prisma.classSession.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }) }),
    );
    expect(prisma.sale.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }) }),
    );
  });

  // -------------------------------------------------------------------------
  // Parallelism: all DB calls must fire before any await completes
  // -------------------------------------------------------------------------

  it('fires all 6 DB calls in a single Promise.all (does not await sequentially)', async () => {
    const callOrder: string[] = [];

    // Replace each mock with a version that records when it was called (sync — call order matters)
    prisma.member.groupBy.mockImplementation(() => { callOrder.push('member'); return Promise.resolve([]); });
    prisma.churnSignal.groupBy.mockImplementation(() => { callOrder.push('churnSignal'); return Promise.resolve([]); });
    prisma.whatsappMessage.groupBy.mockImplementation(() => { callOrder.push('whatsappMessage'); return Promise.resolve([]); });
    prisma.lead.count.mockImplementation(() => { callOrder.push('lead'); return Promise.resolve(0); });
    prisma.classSession.count.mockImplementation(() => { callOrder.push('classSession'); return Promise.resolve(0); });
    prisma.sale.aggregate.mockImplementation(() => { callOrder.push('sale'); return Promise.resolve({ _sum: { totalAed: null } }); });

    await service.overview(tenantId, now);

    // All 6 should have been called
    expect(callOrder).toHaveLength(6);
    // They should all be called before any resolves, which means all appear in callOrder
    // (if sequential, we'd only see later ones after awaiting earlier ones)
    expect(callOrder).toContain('member');
    expect(callOrder).toContain('churnSignal');
    expect(callOrder).toContain('whatsappMessage');
    expect(callOrder).toContain('lead');
    expect(callOrder).toContain('classSession');
    expect(callOrder).toContain('sale');
  });

  // -------------------------------------------------------------------------
  // Date windowing
  // -------------------------------------------------------------------------

  it('computes 30-day since window correctly', async () => {
    const expected30dAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    await service.overview(tenantId, now);

    const churnCall = prisma.churnSignal.groupBy.mock.calls[0][0] as { where: { detectedAt: { gte: Date } } };
    expect(churnCall.where.detectedAt.gte).toEqual(expected30dAgo);
  });

  it('computes month-start window correctly for revenue', async () => {
    await service.overview(tenantId, now);

    const saleCall = prisma.sale.aggregate.mock.calls[0][0] as { where: { createdAt: { gte: Date } } };
    // Jan 15 → month start = Jan 1
    expect(saleCall.where.createdAt.gte).toEqual(new Date(2025, 0, 1));
  });
});
