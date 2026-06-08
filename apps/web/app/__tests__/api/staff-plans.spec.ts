/**
 * Phase 3 + 6 — Staff and Membership Plans API Tests
 *
 * Staff: CRUD + reactivate (P0 — previously 0%)
 * Plans: CRUD (P1 — previously 0%)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody } from './test-helpers';

const mockPrisma: Record<string, any> = {
  staff: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  membershipPlan: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth-server', () => ({
  requireServerUser: vi.fn().mockResolvedValue(MOCK_USER),
  requireTenantId: vi.fn().mockResolvedValue(MOCK_USER.tenantId),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2a$10$hashedmock'),
    compare: vi.fn().mockResolvedValue(false),
  },
}));

const staffHandlers = await import('../../api/staff/route');
const staffIdHandlers = await import('../../api/staff/[id]/route');
const reactivateHandlers = await import('../../api/staff/[id]/reactivate/route');
const plansHandlers = await import('../../api/membership-plans/route');
const plansIdHandlers = await import('../../api/membership-plans/[id]/route');

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ═══════════════════════════════════════════════════════════════════════════
// STAFF
// ═══════════════════════════════════════════════════════════════════════════
describe('Staff — List & Create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/staff — returns active staff', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([
      { id: 's1', fullName: 'Coach Ahmed', role: 'TRAINER', active: true },
      { id: 's2', fullName: 'Sara Reception', role: 'RECEPTION', active: true },
    ]);
    const req = createReq();
    const res = await staffHandlers.GET(req as any);
    const body: any = await jsonBody(res);
    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
  });

  it('GET /api/staff — includes inactive when requested', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([]);
    const req = createReq({ searchParams: { includeInactive: 'true' } });
    await staffHandlers.GET(req as any);
    expect(mockPrisma.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: MOCK_USER.tenantId }) }),
    );
  });

  it('POST /api/staff — creates staff member', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([]); // no PIN conflict
    mockPrisma.staff.create.mockResolvedValue({
      id: 's-new', fullName: 'New Coach', role: 'TRAINER', active: true, pinHash: null,
    });
    const req = createReq({
      method: 'POST',
      body: { fullName: 'New Coach', role: 'TRAINER', hourlyRateAed: 7500, color: '#ff6600' },
    });
    const res = await staffHandlers.POST(req as any);
    expect(res.status).toBe(201);
  });

  it('POST /api/staff — returns 400 on invalid role', async () => {
    const req = createReq({
      method: 'POST',
      body: { fullName: 'Bad Role', role: 'CEO' },
    });
    const res = await staffHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });
});

describe('Staff — Get, Update, Reactivate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/staff/[id] — returns staff by ID', async () => {
    mockPrisma.staff.findFirst.mockResolvedValue({ id: 's1', fullName: 'Coach Ahmed', role: 'TRAINER' });
    const req = createReq();
    const res = await staffIdHandlers.GET(req as any, params('s1'));
    const body: any = await jsonBody(res);
    expect(res.status).toBe(200);
    expect(body.fullName).toBe('Coach Ahmed');
  });

  it('GET /api/staff/[id] — returns 404 when not found', async () => {
    mockPrisma.staff.findFirst.mockResolvedValue(null);
    const req = createReq();
    const res = await staffIdHandlers.GET(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });

  it('PATCH /api/staff/[id] — updates staff details', async () => {
    mockPrisma.staff.findFirst.mockResolvedValue({ id: 's1', fullName: 'Old Name' });
    mockPrisma.staff.findMany.mockResolvedValue([]); // no PIN conflicts
    mockPrisma.staff.update.mockResolvedValue({ id: 's1', fullName: 'New Name', role: 'TRAINER' });
    const req = createReq({ method: 'PATCH', body: { fullName: 'New Name' } });
    const res = await staffIdHandlers.PATCH(req as any, params('s1'));
    expect(res.status).toBe(200);
  });

  it('PATCH — returns 404 when staff not found', async () => {
    mockPrisma.staff.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'PATCH', body: { fullName: 'X' } });
    const res = await staffIdHandlers.PATCH(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });

  it('POST /api/staff/[id]/reactivate — reactivates terminated staff', async () => {
    mockPrisma.staff.findFirst.mockResolvedValue({ id: 's1', active: false, terminatedAt: new Date() });
    mockPrisma.staff.update.mockResolvedValue({ id: 's1', active: true, terminatedAt: null });
    const req = createReq({ method: 'POST' });
    const res = await reactivateHandlers.POST(req as any, params('s1'));
    expect(res.status).toBe(200);
  });

  it('POST /api/staff/[id]/reactivate — returns 404 when not found', async () => {
    mockPrisma.staff.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'POST' });
    const res = await reactivateHandlers.POST(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MEMBERSHIP PLANS
// ═══════════════════════════════════════════════════════════════════════════
describe('Membership Plans — List & Create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/membership-plans — returns all plans', async () => {
    mockPrisma.membershipPlan.findMany.mockResolvedValue([
      { id: 'p1', nameEn: 'Gold', priceAed: 29900, durationDays: 30, active: true },
    ]);
    const req = createReq();
    const res = await plansHandlers.GET(req as any);
    const body: any = await jsonBody(res);
    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
  });

  it('GET /api/membership-plans — filters active only', async () => {
    mockPrisma.membershipPlan.findMany.mockResolvedValue([]);
    const req = createReq({ searchParams: { active: 'true' } });
    await plansHandlers.GET(req as any);
    expect(mockPrisma.membershipPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ active: true }) }),
    );
  });

  it('POST /api/membership-plans — creates a plan', async () => {
    mockPrisma.membershipPlan.create.mockResolvedValue({
      id: 'p-new', nameEn: 'Platinum', priceAed: 49900, durationDays: 60,
    });
    const req = createReq({
      method: 'POST',
      body: { nameEn: 'Platinum', durationDays: 60, priceAed: 49900 },
    });
    const res = await plansHandlers.POST(req as any);
    expect(res.status).toBe(201);
  });

  it('POST /api/membership-plans — returns 400 on missing required fields', async () => {
    const req = createReq({ method: 'POST', body: { nameEn: 'Broken' } });
    const res = await plansHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });
});

describe('Membership Plans — Get & Update', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/membership-plans/[id] — returns plan by ID', async () => {
    mockPrisma.membershipPlan.findFirst.mockResolvedValue({
      id: 'p1', nameEn: 'Gold', priceAed: 29900, durationDays: 30,
    });
    const req = createReq();
    const res = await plansIdHandlers.GET(req as any, params('p1'));
    const body: any = await jsonBody(res);
    expect(res.status).toBe(200);
    expect(body.nameEn).toBe('Gold');
  });

  it('PATCH /api/membership-plans/[id] — updates a plan', async () => {
    mockPrisma.membershipPlan.findFirst.mockResolvedValue({ id: 'p1' });
    mockPrisma.membershipPlan.update.mockResolvedValue({
      id: 'p1', nameEn: 'Gold Plus', priceAed: 34900, durationDays: 30, active: true,
    });
    const req = createReq({ method: 'PATCH', body: { nameEn: 'Gold Plus', priceAed: 34900 } });
    const res = await plansIdHandlers.PATCH(req as any, params('p1'));
    const body: any = await jsonBody(res);
    expect(res.status).toBe(200);
    expect(body.nameEn).toBe('Gold Plus');
  });
});
