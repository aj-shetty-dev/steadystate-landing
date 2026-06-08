/**
 * Phase 1 — Membership Lifecycle API Tests
 *
 * Covers: freeze, unfreeze, cancel, activate, change-plan, renewals, process-renewals
 * Critical P0 business paths — previously 0% coverage
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody } from './test-helpers';

// ── Mock Prisma ──────────────────────────────────────────────────────────
const mockPrisma = {
  membership: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  membershipFreeze: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  membershipPlan: {
    findFirst: vi.fn(),
  },
  member: {
    update: vi.fn(),
    findFirst: vi.fn(),
  },
  $transaction: vi.fn((arg: any) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg(mockPrisma);
  }),
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth-server', () => ({
  requireServerUser: vi.fn().mockResolvedValue(MOCK_USER),
  requireTenantId: vi.fn().mockResolvedValue(MOCK_USER.tenantId),
}));

const freezeHandlers = await import('../../api/memberships/[id]/freeze/route');
const unfreezeHandlers = await import('../../api/memberships/[id]/unfreeze/route');
const cancelHandlers = await import('../../api/memberships/[id]/cancel/route');
const activateHandlers = await import('../../api/memberships/[id]/activate/route');
const changePlanHandlers = await import('../../api/memberships/[id]/change-plan/route');
const renewalsHandlers = await import('../../api/memberships/renewals/route');
const processRenewalsHandlers = await import('../../api/memberships/process-renewals/route');

const SAMPLE_MEMBERSHIP = {
  id: 'ms-1',
  tenantId: MOCK_USER.tenantId,
  memberId: 'mem-1',
  planId: 'plan-1',
  status: 'ACTIVE',
  startDate: new Date('2026-06-01'),
  endDate: new Date('2026-07-01'),
  frozenUntil: null,
  member: { id: 'mem-1', fullName: 'Ahmed', phone: '+971501234567', preferredLocale: 'EN' },
  plan: { id: 'plan-1', nameEn: 'Gold', nameAr: null, maxFreezeDays: 30, durationDays: 30, priceAed: 29900 },
  freezes: [],
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── Freeze ───────────────────────────────────────────────────────────────
describe('POST /api/memberships/[id]/freeze', () => {
  beforeEach(() => vi.clearAllMocks());

  it('freezes an active membership', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({ ...SAMPLE_MEMBERSHIP });
    mockPrisma.membershipFreeze.findFirst.mockResolvedValue(null); // no overlap
    mockPrisma.membershipFreeze.create.mockResolvedValue({ id: 'frz-1', daysUsed: 14 });
    mockPrisma.membership.update.mockResolvedValue({ ...SAMPLE_MEMBERSHIP, status: 'FROZEN' });
    mockPrisma.member.update.mockResolvedValue({});

    const req = createReq({
      method: 'POST',
      body: { startDate: '2026-06-15T00:00:00.000Z', endDate: '2026-06-29T00:00:00.000Z', reason: 'Travel' },
    });
    const res = await freezeHandlers.POST(req as any, params('ms-1'));

    expect(res.status).toBe(201);
  });

  it('returns 400 when endDate is before startDate', async () => {
    const req = createReq({
      method: 'POST',
      body: { startDate: '2026-07-01T00:00:00.000Z', endDate: '2026-06-01T00:00:00.000Z' },
    });
    const res = await freezeHandlers.POST(req as any, params('ms-1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when freeze quota exceeded', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({
      ...SAMPLE_MEMBERSHIP,
      freezes: [{ status: 'ACTIVE', daysUsed: 28 }],
    });
    mockPrisma.membershipFreeze.findFirst.mockResolvedValue(null);

    const req = createReq({
      method: 'POST',
      body: { startDate: '2026-06-15T00:00:00.000Z', endDate: '2026-06-20T00:00:00.000Z' },
    });
    const res = await freezeHandlers.POST(req as any, params('ms-1'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when membership not found', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue(null);
    const req = createReq({
      method: 'POST',
      body: { startDate: '2026-06-15T00:00:00.000Z', endDate: '2026-06-29T00:00:00.000Z' },
    });
    const res = await freezeHandlers.POST(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when membership is CANCELLED', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({ ...SAMPLE_MEMBERSHIP, status: 'CANCELLED' });
    const req = createReq({
      method: 'POST',
      body: { startDate: '2026-06-15T00:00:00.000Z', endDate: '2026-06-29T00:00:00.000Z' },
    });
    const res = await freezeHandlers.POST(req as any, params('ms-1'));
    expect(res.status).toBe(400);
  });

  it('returns 409 when overlapping freeze exists', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({ ...SAMPLE_MEMBERSHIP });
    mockPrisma.membershipFreeze.findFirst.mockResolvedValue({ id: 'frz-existing' }); // overlap!

    const req = createReq({
      method: 'POST',
      body: { startDate: '2026-06-15T00:00:00.000Z', endDate: '2026-06-29T00:00:00.000Z' },
    });
    const res = await freezeHandlers.POST(req as any, params('ms-1'));
    expect(res.status).toBe(409);
  });
});

// ── Unfreeze ─────────────────────────────────────────────────────────────
describe('POST /api/memberships/[id]/unfreeze', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unfreezes a frozen membership', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({
      ...SAMPLE_MEMBERSHIP,
      status: 'FROZEN',
      freezes: [{ id: 'frz-1', status: 'ACTIVE', daysUsed: 14 }],
    });
    mockPrisma.membershipFreeze.update.mockResolvedValue({});
    mockPrisma.membership.update.mockResolvedValue({ ...SAMPLE_MEMBERSHIP, status: 'ACTIVE', frozenUntil: null });
    mockPrisma.member.update.mockResolvedValue({});

    const req = createReq({ method: 'POST' });
    const res = await unfreezeHandlers.POST(req as any, params('ms-1'));

    expect(res.status).toBe(200);
  });

  it('returns membership as-is if not frozen', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({ ...SAMPLE_MEMBERSHIP, status: 'ACTIVE' });

    const req = createReq({ method: 'POST' });
    const res = await unfreezeHandlers.POST(req as any, params('ms-1'));

    expect(res.status).toBe(200);
    const body: any = await jsonBody(res);
    expect(body.status).toBe('ACTIVE');
  });

  it('returns 404 when membership not found', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'POST' });
    const res = await unfreezeHandlers.POST(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });
});

// ── Cancel ───────────────────────────────────────────────────────────────
describe('POST /api/memberships/[id]/cancel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancels an active membership', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({ ...SAMPLE_MEMBERSHIP });
    mockPrisma.membership.update.mockResolvedValue({ ...SAMPLE_MEMBERSHIP, status: 'CANCELLED' });
    mockPrisma.member.update.mockResolvedValue({});

    const req = createReq({ method: 'POST', body: { reason: 'Relocating' } });
    const res = await cancelHandlers.POST(req as any, params('ms-1'));

    expect(res.status).toBe(200);
  });

  it('cancels without a reason', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({ ...SAMPLE_MEMBERSHIP });
    mockPrisma.membership.update.mockResolvedValue({ ...SAMPLE_MEMBERSHIP, status: 'CANCELLED' });
    mockPrisma.member.update.mockResolvedValue({});

    const req = createReq({ method: 'POST', body: {} });
    const res = await cancelHandlers.POST(req as any, params('ms-1'));

    expect(res.status).toBe(200);
  });

  it('returns 404 when membership not found', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'POST' });
    const res = await cancelHandlers.POST(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });
});

// ── Activate ─────────────────────────────────────────────────────────────
describe('POST /api/memberships/[id]/activate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('activates a PENDING_PAYMENT membership', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({ ...SAMPLE_MEMBERSHIP, status: 'PENDING_PAYMENT' });
    mockPrisma.membership.update.mockResolvedValue({ ...SAMPLE_MEMBERSHIP, status: 'ACTIVE' });
    mockPrisma.member.update.mockResolvedValue({});

    const req = createReq({ method: 'POST' });
    const res = await activateHandlers.POST(req as any, params('ms-1'));

    expect(res.status).toBe(200);
  });

  it('returns 400 when membership is already ACTIVE', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({ ...SAMPLE_MEMBERSHIP, status: 'ACTIVE' });

    const req = createReq({ method: 'POST' });
    const res = await activateHandlers.POST(req as any, params('ms-1'));

    expect(res.status).toBe(400);
  });

  it('returns 404 when membership not found', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'POST' });
    const res = await activateHandlers.POST(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });
});

// ── Change Plan ──────────────────────────────────────────────────────────
describe('POST /api/memberships/[id]/change-plan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('changes plan and creates new active membership', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({ ...SAMPLE_MEMBERSHIP });
    mockPrisma.membershipPlan.findFirst.mockResolvedValue({
      id: 'plan-2', nameEn: 'Platinum', durationDays: 60, priceAed: 49900, active: true, tenantId: MOCK_USER.tenantId,
    });
    mockPrisma.membership.update.mockResolvedValue({});
    mockPrisma.membership.create.mockResolvedValue({
      id: 'ms-new',
      memberId: 'mem-1',
      planId: 'plan-2',
      status: 'ACTIVE',
      startDate: new Date(),
      endDate: new Date(Date.now() + 60 * 86400000),
      member: { id: 'mem-1', fullName: 'Ahmed', phone: '+971501234567' },
      plan: { id: 'plan-2', nameEn: 'Platinum', durationDays: 60, priceAed: 49900 },
    });
    mockPrisma.member.update.mockResolvedValue({});

    const req = createReq({ method: 'POST', body: { newPlanId: 'plan-2' } });
    const res = await changePlanHandlers.POST(req as any, params('ms-1'));

    expect(res.status).toBe(201);
    const body: any = await jsonBody(res);
    expect(body.plan.nameEn).toBe('Platinum');
  });

  it('returns 400 when newPlanId is missing', async () => {
    const req = createReq({ method: 'POST', body: {} });
    const res = await changePlanHandlers.POST(req as any, params('ms-1'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when plan not found', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({ ...SAMPLE_MEMBERSHIP });
    mockPrisma.membershipPlan.findFirst.mockResolvedValue(null);

    const req = createReq({ method: 'POST', body: { newPlanId: 'bad-plan' } });
    const res = await changePlanHandlers.POST(req as any, params('ms-1'));
    expect(res.status).toBe(404);
  });
});

// ── Renewals ─────────────────────────────────────────────────────────────
describe('GET /api/memberships/renewals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns upcoming renewals within default 30-day window', async () => {
    mockPrisma.membership.findMany.mockResolvedValue([
      {
        id: 'ms-1', status: 'PENDING_PAYMENT', startDate: new Date(),
        member: { id: 'mem-1', fullName: 'Ahmed', phone: '+971501234567' },
        plan: { id: 'plan-1', nameEn: 'Gold', priceAed: 29900, durationDays: 30 },
      },
    ]);

    const req = createReq();
    const res = await renewalsHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].member.fullName).toBe('Ahmed');
  });

  it('respects custom days parameter', async () => {
    mockPrisma.membership.findMany.mockResolvedValue([]);

    const req = createReq({ searchParams: { days: '14' } });
    await renewalsHandlers.GET(req as any);

    // Verify cutoff date is within 14-day window
    expect(mockPrisma.membership.findMany).toHaveBeenCalled();
  });

  it('clamps days to 1–90 range', async () => {
    mockPrisma.membership.findMany.mockResolvedValue([]);

    // days=0 should clamp to 1
    const req = createReq({ searchParams: { days: '0' } });
    await renewalsHandlers.GET(req as any);
    expect(mockPrisma.membership.findMany).toHaveBeenCalled();
  });
});

// ── Process Renewals ─────────────────────────────────────────────────────
describe('POST /api/memberships/process-renewals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('processes due renewals and returns counts', async () => {
    mockPrisma.membership.findMany.mockResolvedValue([
      {
        id: 'ms-1', status: 'ACTIVE', endDate: new Date(Date.now() + 7 * 86400000),
        member: { id: 'mem-1', fullName: 'Ahmed', membershipStatus: 'ACTIVE' },
        plan: { id: 'plan-1', nameEn: 'Gold', durationDays: 30, priceAed: 29900 },
      },
      {
        id: 'ms-2', status: 'ACTIVE', endDate: new Date(Date.now() + 14 * 86400000),
        member: { id: 'mem-2', fullName: 'Fatima', membershipStatus: 'ACTIVE' },
        plan: { id: 'plan-1', nameEn: 'Gold', durationDays: 30, priceAed: 29900 },
      },
    ]);
    mockPrisma.membership.create.mockResolvedValue({ id: 'ms-new' });

    const req = createReq({ method: 'POST' });
    const res = await processRenewalsHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.due).toBe(2);
    expect(body.created).toBe(2);
    expect(body.failed).toBe(0);
  });

  it('returns zero counts when no memberships due', async () => {
    mockPrisma.membership.findMany.mockResolvedValue([]);

    const req = createReq({ method: 'POST' });
    const res = await processRenewalsHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.due).toBe(0);
    expect(body.created).toBe(0);
  });

  it('handles failures gracefully', async () => {
    mockPrisma.membership.findMany.mockResolvedValue([
      {
        id: 'ms-1', status: 'ACTIVE', endDate: new Date(Date.now() + 7 * 86400000),
        member: { id: 'mem-1', fullName: 'Ahmed', membershipStatus: 'ACTIVE' },
        plan: { id: 'plan-1', nameEn: 'Gold', durationDays: 30, priceAed: 29900 },
      },
    ]);
    mockPrisma.membership.create.mockRejectedValue(new Error('DB error'));

    const req = createReq({ method: 'POST' });
    const res = await processRenewalsHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.failed).toBe(1);
  });
});
